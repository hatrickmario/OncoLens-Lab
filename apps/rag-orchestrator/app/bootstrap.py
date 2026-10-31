"""Raíz de composición: único lugar que conoce las clases concretas."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, NoReturn

from fastapi import FastAPI
from pydantic import ValidationError

from app.api.contencion_de_errores import ContencionDeErroresInesperados
from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_require_service_jwt
from app.api.errors import registrar_manejadores_de_error
from app.api.health import crear_router_health
from app.api.rag_query import crear_router_rag_query
from app.api.trace import ContextoDeTraceId
from app.application.aplicabilidad import ApplicabilityService
from app.application.catalogo_exigido import ConsultaConCatalogoExigido
from app.application.consulta_no_componible import ConsultaNoComponible
from app.application.ports import (
    CatalogoClinico,
    ChunkSearch,
    Clock,
    CorpusCatalogReader,
    CorpusReleaseReader,
    EvidenceGenerator,
    EvidenceQueryPort,
    LanguageDetector,
    LlmHealthPort,
    NliClassifier,
    ProhibitedTermsChecker,
    PuertosDelCorpus,
    QueryEmbedder,
    QuerySparseEncoder,
    Reranker,
    SparseChunkSearch,
    TraceIdGenerator,
)
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
)
from app.config.errores_de_configuracion import (
    MOTIVO_CATALOGO_NO_DISPONIBLE,
    MOTIVO_TIPO_NO_EN_CATALOGO,
    MOTIVO_VARIABLE_AUSENTE,
    describir_errores,
)
from app.config.logging import registrar_evento, silenciar_urls_de_httpx_en_logs
from app.config.settings import Settings, claves_de_recuperacion_ausentes, nombres_de_claves
from app.config.version import VERSION_DEL_SERVICIO
from app.domain.criterios_aplicabilidad import CriteriosDeAplicabilidad
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.domain.tipos_habilitados import tipos_ausentes_del_catalogo
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_del_catalogo
from app.infrastructure.catalogo_clinico.aplicabilidad import (
    CriteriosDelCatalogo,
    cargar_criterios_de_aplicabilidad,
)
from app.infrastructure.catalogo_clinico.manifiesto import (
    CatalogoNoConfigurado,
    CatalogoNoDisponible,
    cargar_catalogo_del_manifiesto,
)
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.infrastructure.fake.fake_llm_health import FakeLlmHealth
from app.infrastructure.lenguaje.terminos_prohibidos import (
    ListaDeTerminosNoDisponible,
    cargar_verificador_de_terminos,
)
from app.infrastructure.llm.fabrica_local import (
    crear_generador_local,
    crear_proponente_local,
    crear_reescritor_local,
    parametros_de_reescritura,
    parametros_del_respaldo,
)
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from app.infrastructure.security.clave_publica import cargar_clave_publica_es256
from app.infrastructure.security.service_jwt_verifier import ServiceJwtVerifier
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator
from app.schemas.generated.models import LlmProvider, RetrievalMode

if (
    TYPE_CHECKING
):  # solo para el tipado: importarlo en ejecución cargaría onnxruntime aun con MODEL_PROVIDER=fake
    from app.infrastructure.models.local import ModelosDeRecuperacion


logger = logging.getLogger(__name__)


class ConfiguracionDeRecuperacionIncompleta(ValueError):
    """Falta una clave de la recuperación de `/rag/query` (RN-22); el mensaje las nombra, nunca sus valores."""


@dataclass(frozen=True)
class PuertosDeRecuperacion:
    """Bordes de la recuperación que la composición recibe ya construidos (adapters reales tras L1D-102 o falsos de test)."""

    detector_idioma: LanguageDetector
    embedder: QueryEmbedder
    buscador: ChunkSearch
    reranker: Reranker
    lector_release: CorpusReleaseReader
    catalogo: CorpusCatalogReader
    catalogo_clinico: CatalogoClinico
    clasificador_nli: NliClassifier
    verificador_terminos: ProhibitedTermsChecker
    buscador_sparse: SparseChunkSearch | None = None
    """Rama *sparse* del corpus (US-112); solo se exige con ``RETRIEVAL_MODE=hibrida``."""
    embedder_sparse: QuerySparseEncoder | None = None


CargadorDeModelos = Callable[[Settings], "ModelosDeRecuperacion"]


@dataclass(frozen=True)
class CatalogoMontado:
    """El catálogo clínico y sus criterios de aplicabilidad, leídos una sola vez al arrancar (sin doble lectura)."""

    catalogo: CatalogoClinico
    criterios: CriteriosDeAplicabilidad


def cargar_settings_o_salir() -> Settings:
    """Solo los ``Settings`` de ``cargar_configuracion_o_salir`` (los tests de arranque no necesitan el catálogo)."""
    return cargar_configuracion_o_salir()[0]


def cargar_configuracion_o_salir() -> tuple[Settings, CatalogoMontado]:
    """Carga ``Settings`` y el catálogo clínico montado una sola vez (el manifiesto se lee una vez, sin TOCTOU).

    Si el entorno es inválido registra un ``configuracion_invalida`` por variable (nombre y regla, nunca el valor) y
    termina el proceso con código 1 antes de escuchar (US-037 AC-2, RN-22, US-041 AC-5). Es el único traductor a
    ``SystemExit``: ``crear_app`` lanza ``CatalogoNoDisponible`` y no sabe de procesos."""
    try:
        settings = Settings()
    except ValidationError as error:
        _salir_registrando(describir_errores(error))
    montado, eventos_del_catalogo = cargar_catalogo_clinico_o_eventos(settings)
    eventos = [*_eventos_de_recuperacion_ausente(settings), *eventos_del_catalogo]
    if montado is not None:
        eventos.extend(_eventos_de_tipos_habilitados(settings, montado.catalogo))
    if eventos or montado is None:
        _salir_registrando(eventos)
    return settings, montado


def _salir_registrando(eventos: list[dict[str, str]]) -> NoReturn:
    for evento in eventos:
        registrar_evento(logger, logging.ERROR, "configuracion_invalida", **evento)
    raise SystemExit(1)


def _eventos_de_recuperacion_ausente(settings: Settings) -> list[dict[str, str]]:
    """Con ``LLM_PROVIDER=local`` /rag/query exige sus valores de recuperación (RN-22): falta = variable_ausente."""
    if settings.llm_provider != "local":
        return []
    return [
        {
            "variable": clave,
            "regla": "obligatoria con LLM_PROVIDER=local",
            "motivo": MOTIVO_VARIABLE_AUSENTE,
        }
        for clave in claves_de_recuperacion_ausentes(settings)
    ]


def _eventos_de_tipos_habilitados(
    settings: Settings, catalogo: CatalogoClinico
) -> list[dict[str, str]]:
    """``ENABLED_CANCER_TYPES`` (RN-20, US-043) con un tipo que el manifiesto no declara es inválida; que falte con
    ``LLM_PROVIDER=local`` lo informa ``_eventos_de_recuperacion_ausente``. El evento nombra la variable, nunca el tipo."""
    if tipos_ausentes_del_catalogo(settings.enabled_cancer_types, catalogo.tipos_de_cancer()):
        return [
            {
                "variable": "ENABLED_CANCER_TYPES",
                "regla": "tipos declarados en el manifiesto del catálogo",
                "motivo": MOTIVO_TIPO_NO_EN_CATALOGO,
            }
        ]
    return []


def cargar_catalogo_clinico_o_eventos(
    settings: Settings,
) -> tuple[CatalogoMontado | None, list[dict[str, str]]]:
    """El catálogo montado con sus criterios o el evento que explica por qué no (US-041 AC-5, D4); nunca la ruta ni el contenido.

    Variable sin definir = ``variable_ausente``; manifiesto ausente o ilegible = ``catalogo_no_disponible``."""
    try:
        catalogo = _montar_catalogo_clinico(settings)
    except CatalogoNoConfigurado:
        regla, motivo = "obligatoria", MOTIVO_VARIABLE_AUSENTE
    except CatalogoNoDisponible:
        regla, motivo = "manifest.json legible", MOTIVO_CATALOGO_NO_DISPONIBLE
    else:
        try:
            criterios = _montar_criterios_de_aplicabilidad(settings, catalogo)
        except CatalogoNoDisponible:
            regla, motivo = "aplicabilidad.json válido por tipo", MOTIVO_CATALOGO_NO_DISPONIBLE
        else:
            return CatalogoMontado(catalogo, criterios), []
    return None, [{"variable": "CLINICAL_CATALOG_PATH", "regla": regla, "motivo": motivo}]


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
    clock: Clock | None = None,
    consulta: EvidenceQueryPort | None = None,
    recuperacion: PuertosDeRecuperacion | None = None,
    corpus: PuertosDelCorpus | None = None,
    cargador_de_modelos: CargadorDeModelos | None = None,
    generador: EvidenceGenerator | None = None,
    catalogo_clinico: CatalogoClinico | None = None,
    criterios_de_aplicabilidad: CriteriosDeAplicabilidad | None = None,
) -> FastAPI:
    silenciar_urls_de_httpx_en_logs()
    modelos = _cargar_modelos_segun(settings, cargador_de_modelos)
    catalogo_clinico = catalogo_clinico or _montar_catalogo_clinico(settings)
    recuperacion = recuperacion or _componer_recuperacion(
        settings, modelos, corpus, catalogo_clinico
    )
    trace_ids = trace_ids or UuidTraceIdGenerator()
    clock = clock or RelojDelSistema()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    # Los criterios se montan una vez desde el catálogo (L1D-126, D4) y los consume la aplicabilidad (US-122).
    app.state.criterios_de_aplicabilidad = (
        criterios_de_aplicabilidad
        if criterios_de_aplicabilidad is not None
        else _montar_criterios_de_aplicabilidad(settings, catalogo_clinico)
    )
    registrar_manejadores_de_error(app, trace_ids)
    app.add_middleware(ContencionDeErroresInesperados, trace_ids=trace_ids)
    app.add_middleware(
        ContextoDeTraceId, trace_ids=trace_ids
    )  # el más externo: fija el traceId de los logs
    verificador = _crear_verificador_jwt_de_servicio(settings, clock)
    _registrar_consulta_de_evidencia(
        app,
        settings,
        consulta=consulta,
        autenticacion=crear_require_service_jwt(verificador),
        recuperacion=recuperacion,
        clock=clock,
        generador=generador,
        catalogo_clinico=catalogo_clinico,
        criterios_de_aplicabilidad=app.state.criterios_de_aplicabilidad,
    )
    app.include_router(
        crear_router_health(
            llm_health or _sonda_llm_segun(settings),
            trace_ids,
            nombres_de_claves(settings),
            VERSION_DEL_SERVICIO,
            catalogo_clinico,
        )
    )
    return app


def _cargar_modelos_segun(
    settings: Settings, cargador: CargadorDeModelos | None
) -> ModelosDeRecuperacion | None:
    """``MODEL_PROVIDER=local``: verifica los pesos y construye los adapters antes de aceptar tráfico.

    Con ``fake`` no se importa ningún runtime de modelos (``onnxruntime``, ``tokenizers``); el import es diferido.
    """
    if settings.model_provider == "fake":
        return None
    if cargador is None:
        from app.infrastructure.models.local import cargar_modelos_locales

        cargador = cargar_modelos_locales
    return cargador(settings)


def _componer_recuperacion(
    settings: Settings,
    modelos: ModelosDeRecuperacion | None,
    corpus: PuertosDelCorpus | None,
    catalogo_clinico: CatalogoClinico,
) -> PuertosDeRecuperacion | None:
    """Modelos reales + corpus (Milvus y catálogo) = los bordes completos; si falta alguno, no hay recuperación."""
    if modelos is None or corpus is None:
        return None
    return PuertosDeRecuperacion(
        detector_idioma=modelos.detector_idioma,
        embedder=modelos.embedder_consulta,
        buscador=corpus.buscador,
        reranker=modelos.reranker,
        lector_release=corpus.lector_release,
        catalogo=corpus.catalogo,
        catalogo_clinico=catalogo_clinico,
        clasificador_nli=modelos.clasificador_nli,
        verificador_terminos=_cargar_lista_de_terminos(settings),
        buscador_sparse=corpus.buscador_sparse,
        embedder_sparse=modelos.embedder_sparse_consulta,
    )


def _montar_catalogo_clinico(settings: Settings) -> CatalogoClinico:
    """El catálogo montado (su versión). Sin ruta o sin manifiesto legible lanza ``CatalogoNoDisponible`` (D4)."""
    if settings.clinical_catalog_path is None:
        raise CatalogoNoConfigurado("CLINICAL_CATALOG_PATH no está configurada")
    return cargar_catalogo_del_manifiesto(settings.clinical_catalog_path)


def _montar_criterios_de_aplicabilidad(
    settings: Settings, catalogo: CatalogoClinico
) -> CriteriosDeAplicabilidad:
    """Los criterios de ``<tipo>/aplicabilidad.json`` de cada tipo del manifiesto; sin ruta de catálogo (solo
    alcanzable con un ``CatalogoClinico`` inyectado) no hay criterios que leer. Un archivo ilegible o fuera de esquema
    lanza ``CatalogoNoDisponible``."""
    if settings.clinical_catalog_path is None:
        return CriteriosDelCatalogo({})
    return cargar_criterios_de_aplicabilidad(
        settings.clinical_catalog_path, catalogo.tipos_de_cancer()
    )


def _cargar_lista_de_terminos(settings: Settings) -> ProhibitedTermsChecker:
    """La lista versionada de términos prohibidos del catálogo montado (RN-23); sin ella no hay respuesta con evidencia."""
    _exigir_claves({"CLINICAL_CATALOG_PATH": settings.clinical_catalog_path})
    try:
        return cargar_verificador_de_terminos(settings.clinical_catalog_path)  # type: ignore[arg-type]
    except ListaDeTerminosNoDisponible:
        raise ConfiguracionDeRecuperacionIncompleta(
            "CLINICAL_CATALOG_PATH: no contiene lenguaje/terminos-prohibidos.json válido"
        ) from None


def _crear_verificador_jwt_de_servicio(settings: Settings, clock: Clock) -> ServiceJwtVerifier:
    # Fallo cerrado (también con LLM_PROVIDER=fake): sin clave pública legible no hay quien autentique a clinical-api.
    clave_publica = cargar_clave_publica_es256(settings.service_jwt_public_key_file)
    return ServiceJwtVerifier(
        clave_publica,
        clock,
        settings.service_jwt_ttl_seconds,
        settings.service_jwt_clock_skew_seconds,
    )


def _sonda_llm_segun(settings: Settings) -> LlmHealthPort:
    if settings.llm_provider == "fake":
        return FakeLlmHealth()
    return OpenAICompatibleLlmHealth(settings.llm_base_url, settings.llm_health_timeout_ms)


def _registrar_consulta_de_evidencia(
    app: FastAPI,
    settings: Settings,
    *,
    consulta: EvidenceQueryPort | None,
    autenticacion: DependenciaJwtServicio,
    recuperacion: PuertosDeRecuperacion | None,
    clock: Clock,
    generador: EvidenceGenerator | None,
    catalogo_clinico: CatalogoClinico,
    criterios_de_aplicabilidad: CriteriosDeAplicabilidad,
) -> None:
    if consulta is None and settings.llm_provider == "fake":
        consulta = ConsultaConCatalogoExigido(
            FakeEvidenceQuery.desde_directorio(settings.fake_responses_path), catalogo_clinico
        )
    elif consulta is None:
        # LLM_PROVIDER=local: la ruta siempre existe. La configuración se exige aunque falten los bordes reales
        # (adapters de embeddings, reranker e idioma, US-231): sin ellos responde 503 fallando cerrado.
        _exigir_configuracion_de_recuperacion(settings)
        consulta = (
            _crear_servicio_de_recuperacion(
                settings, recuperacion, clock, generador, criterios_de_aplicabilidad
            )
            if recuperacion is not None
            else ConsultaNoComponible()
        )
    if consulta is not None:
        app.include_router(crear_router_rag_query(consulta, autenticacion))


def _crear_servicio_de_recuperacion(
    settings: Settings,
    puertos: PuertosDeRecuperacion,
    clock: Clock,
    generador: EvidenceGenerator | None,
    criterios_de_aplicabilidad: CriteriosDeAplicabilidad,
) -> RAGOrchestratorService:
    _exigir_ramas_de_la_recuperacion_hibrida(settings, puertos)
    return RAGOrchestratorService(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        buscador=puertos.buscador,
        reranker=puertos.reranker,
        lector_release=puertos.lector_release,
        catalogo=puertos.catalogo,
        catalogo_clinico=puertos.catalogo_clinico,
        aplicabilidad=ApplicabilityService(criterios_de_aplicabilidad),
        # Producción: el mismo LLM local (RN-12); la validación de cita, lenguaje y NLI es del servicio, no del adapter.
        proponente=crear_proponente_local(settings),
        clasificador_nli=puertos.clasificador_nli,
        verificador_terminos=puertos.verificador_terminos,
        # Producción: el LLM local (RN-12). La rama con evidencia ya verifica el soporte NLI y el lenguaje antes de
        # responder (L1D-180, D9 de L1D-275): ninguna opción sin verificar sale de este servicio.
        generador=generador or crear_generador_local(settings),
        reloj=clock,
        parametros=_parametros_de_recuperacion(settings),
        buscador_sparse=puertos.buscador_sparse,
        embedder_sparse=puertos.embedder_sparse,
        # Segundo loop (US-238): el mismo LLM local (RN-12) y solo términos del catálogo montado (RN-27).
        reescritor=crear_reescritor_local(settings),
        terminos_del_catalogo=_terminos_del_catalogo_montado(settings, puertos.catalogo_clinico),
    )


def _terminos_del_catalogo_montado(settings: Settings, catalogo: CatalogoClinico) -> frozenset[str]:
    """Términos y sinónimos de cada tipo del manifiesto; sin ruta de catálogo (solo con un catálogo inyectado) no hay."""
    if settings.clinical_catalog_path is None:
        return frozenset()
    return cargar_terminos_del_catalogo(settings.clinical_catalog_path, catalogo.tipos_de_cancer())


def _exigir_configuracion_de_recuperacion(settings: Settings) -> None:
    """Umbral y tamaños de la recuperación (RN-22): sin valor por defecto en código, el arranque se niega si faltan."""
    ausentes = claves_de_recuperacion_ausentes(settings)
    if ausentes:
        raise ConfiguracionDeRecuperacionIncompleta(
            f"falta configurar para /rag/query: {', '.join(ausentes)}"
        )


def _exigir_ramas_de_la_recuperacion_hibrida(
    settings: Settings, puertos: PuertosDeRecuperacion
) -> None:
    """``RETRIEVAL_MODE=hibrida`` sin la rama sparse (búsqueda o codificador) no arranca: nunca degrada a dense en silencio."""
    if settings.retrieval_mode != "hibrida":
        return
    faltan = [
        nombre
        for nombre, puerto in (
            ("la búsqueda sparse del corpus", puertos.buscador_sparse),
            ("el codificador sparse de la consulta", puertos.embedder_sparse),
        )
        if puerto is None
    ]
    if faltan:
        raise ConfiguracionDeRecuperacionIncompleta(
            f"RETRIEVAL_MODE=hibrida exige {' y '.join(faltan)}"
        )


def _exigir_claves(valores: dict[str, object]) -> None:
    ausentes = [clave for clave, valor in valores.items() if valor is None]
    if ausentes:
        raise ConfiguracionDeRecuperacionIncompleta(
            f"falta configurar para /rag/query: {', '.join(ausentes)}"
        )


def _proveedor_de_meta(settings: Settings) -> LlmProvider:
    """``LLM_PROVIDER`` (vocabulario de configuración) → ``meta.llmProvider`` (vocabulario del contrato, RN-12).

    Mapeo explícito: ``local`` es el único proveedor con adapter; ``fake`` responde con los ejemplos y nunca llega a la
    recuperación real; ``nube`` entrará aquí cuando exista su adapter.
    """
    if settings.llm_provider == "local":
        return LlmProvider.local
    raise ConfiguracionDeRecuperacionIncompleta(
        "LLM_PROVIDER no tiene un proveedor de meta para la recuperación real"
    )


def _parametros_de_recuperacion(settings: Settings) -> ParametrosDeRecuperacion:
    """Los valores de configuración (RN-22) y la procedencia de ``meta``: ``nliModel`` sale del clasificador y
    ``promptVersion`` del prompt, nunca de una copia en configuración."""
    _exigir_configuracion_de_recuperacion(settings)
    return ParametrosDeRecuperacion(
        relevance_threshold=settings.relevance_threshold,  # type: ignore[arg-type]
        retrieval_top_k=settings.retrieval_top_k,  # type: ignore[arg-type]
        rerank_top_n=settings.rerank_top_n,  # type: ignore[arg-type]
        longitud_maxima_codigo_tipo=settings.retrieval_cancer_type_max_length,
        llm_provider=_proveedor_de_meta(settings),
        llm_model=settings.llm_model,
        nli_entailment_threshold=settings.nli_entailment_threshold,  # type: ignore[arg-type]
        tipos_habilitados=settings.enabled_cancer_types,
        respaldo=parametros_del_respaldo(settings),
        reescritura=parametros_de_reescritura(settings),
        retrieval_mode=RetrievalMode(settings.retrieval_mode),
        retrieval_fusion=EstrategiaDeFusion(settings.retrieval_fusion),
        rrf_k=settings.rrf_k,
        peso_sparse=settings.hybrid_sparse_weight,
        claim_max_words=settings.claim_max_words,
        # Con modelos locales el tope sale de ADR-39 (RERANKER_MAX_PAIRS); sin él, el reranker no limita y no se recorta.
        reranker_max_pairs=settings.modelos.reranker_max_pairs if settings.modelos else None,
    )
