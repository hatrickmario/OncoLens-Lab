"""Composición del ``RAGOrchestratorService`` de la suite: adapters falsos o locales, cronometrados y observados."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.application.aplicabilidad import ApplicabilityService
from app.application.aplicabilidad_textual import ParametrosDelRespaldo
from app.application.ports import (
    Clock,
    EvidenceGenerator,
    LanguageDetector,
    NliClassifier,
    PoblacionTask,
    ProhibitedTermsChecker,
    QueryEmbedder,
    Reranker,
)
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
)
from app.config.settings import (
    POBLACION_CONCURRENCIA_INICIAL,
    POBLACION_PLAZO_DEL_RESPALDO_MS_INICIAL,
    POBLACION_VERSION_DEL_PROMPT_INICIAL,
)
from app.evaluation.adaptadores_falsos import (
    BuscadorEnMemoria,
    CatalogoClinicoDeConfig,
    CatalogoEnMemoria,
    EmbedderBolsaDePalabras,
    GeneradorGuionado,
    LectorReleaseFijo,
    NliLexico,
    RerankerLexico,
)
from app.evaluation.config_suite import ConfigInvalida, ConfigSuite
from app.evaluation.cronometro import Cronometro
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.juez_fidelidad import JuezFidelidad, JuezNli, JuezSecundario
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.medidores import (
    BuscadorMedido,
    CatalogoMedido,
    DetectorMedido,
    EmbedderMedido,
    GeneradorObservado,
    LatenciasNli,
    LectorReleaseMedido,
    NliMedido,
    Observaciones,
    RerankerObservado,
)
from app.evaluation.modelos_locales import PuertosLocales
from app.infrastructure.catalogo_clinico.aplicabilidad import CriteriosDelCatalogo
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.fake.tarea_de_poblacion_silenciosa import TareaDePoblacionSilenciosa
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.lenguaje.terminos_prohibidos import (
    VerificadorDeTerminosProhibidos,
    cargar_lista_de_terminos,
)
from app.schemas.generated.models import LlmProvider

LONGITUD_MAXIMA_CODIGO_TIPO = 64


@dataclass(frozen=True)
class ServicioDeSuite:
    servicio: RAGOrchestratorService
    observaciones: Observaciones
    cronometro: Cronometro
    catalogo_version: str
    verificador_estricto: VerificadorEstricto
    verificador_produccion: ProhibitedTermsChecker
    juez_nli: JuezFidelidad
    juez_llm: JuezSecundario | None
    latencias_nli: LatenciasNli


PARAMETROS_DEL_RESPALDO_DE_LA_SUITE = ParametrosDelRespaldo(
    plazo_ms=POBLACION_PLAZO_DEL_RESPALDO_MS_INICIAL,
    concurrencia=POBLACION_CONCURRENCIA_INICIAL,
    version_del_prompt=POBLACION_VERSION_DEL_PROMPT_INICIAL,
)
"""El respaldo de la población de la suite: con adapters falsos el plazo y la concurrencia no cambian la medida."""


def parametros_de_recuperacion(
    config: ConfigSuite, tipos_habilitados: tuple[str, ...]
) -> ParametrosDeRecuperacion:
    u = config.umbrales
    return ParametrosDeRecuperacion(
        relevance_threshold=u.relevance_threshold,
        retrieval_top_k=u.retrieval_top_k,
        rerank_top_n=u.rerank_top_n,
        longitud_maxima_codigo_tipo=LONGITUD_MAXIMA_CODIGO_TIPO,
        llm_provider=LlmProvider.local,
        llm_model=config.llm_modelo,
        nli_entailment_threshold=u.nli_entailment_threshold,
        tipos_habilitados=tipos_habilitados,
        respaldo=PARAMETROS_DEL_RESPALDO_DE_LA_SUITE,
    )


@dataclass(frozen=True)
class _Adaptadores:
    """Los puertos que cambian entre ``fake`` y ``local``; el resto del servicio es el mismo."""

    detector_idioma: LanguageDetector
    embedder: QueryEmbedder
    vectores_de_chunks: Sequence[Sequence[float]]
    reranker: Reranker
    generador: EvidenceGenerator
    clasificador_nli: NliClassifier
    proponente: PoblacionTask


def _adaptadores_falsos(dataset: DatasetSuite) -> _Adaptadores:
    embedder = EmbedderBolsaDePalabras()
    return _Adaptadores(
        detector_idioma=DetectorDeIdiomaLocal("es"),
        embedder=embedder,
        vectores_de_chunks=[embedder.embeber(c.texto) for c in dataset.chunks],
        reranker=RerankerLexico(),
        generador=GeneradorGuionado(dataset),
        clasificador_nli=NliLexico(),
        proponente=TareaDePoblacionSilenciosa(),
    )


def _adaptadores_locales(puertos: PuertosLocales, dataset: DatasetSuite) -> _Adaptadores:
    return _Adaptadores(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        vectores_de_chunks=puertos.embedder_pasajes.embeber([c.texto for c in dataset.chunks]),
        reranker=puertos.reranker,
        generador=puertos.generador,
        clasificador_nli=puertos.clasificador_nli,
        proponente=puertos.proponente,  # el de producción: la suite local no usa el silencioso
    )


def _adaptadores_de(
    config: ConfigSuite, dataset: DatasetSuite, puertos_locales: PuertosLocales | None
) -> _Adaptadores:
    if config.proveedor == "fake":
        return _adaptadores_falsos(dataset)
    if puertos_locales is None:
        raise ConfigInvalida("adaptadores.proveedor: local exige los puertos reales ya cargados")
    return _adaptadores_locales(puertos_locales, dataset)


def componer_servicio(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    juez_llm: JuezSecundario | None = None,
    puertos_locales: PuertosLocales | None = None,
) -> ServicioDeSuite:
    adaptadores = _adaptadores_de(config, dataset, puertos_locales)
    observaciones = Observaciones()
    nli = NliMedido(adaptadores.clasificador_nli, cronometro)
    lista = cargar_lista_de_terminos(config.ruta_terminos)  # se lee y valida una sola vez
    terminos = VerificadorDeTerminosProhibidos(lista)
    # La suite habilita los tipos del catálogo montado (RN-20): el dataset no restringe el tipo y la huella no cambia.
    tipos_habilitados = cargar_catalogo_del_manifiesto(config.ruta_terminos).tipos_de_cancer()
    servicio = RAGOrchestratorService(
        detector_idioma=DetectorMedido(adaptadores.detector_idioma, cronometro),
        embedder=EmbedderMedido(adaptadores.embedder, cronometro),
        buscador=BuscadorMedido(
            BuscadorEnMemoria(dataset, adaptadores.vectores_de_chunks), cronometro
        ),
        reranker=RerankerObservado(adaptadores.reranker, cronometro, observaciones),
        lector_release=LectorReleaseMedido(LectorReleaseFijo(dataset), cronometro),
        catalogo=CatalogoMedido(CatalogoEnMemoria(dataset), cronometro),
        catalogo_clinico=CatalogoClinicoDeConfig(config.catalogo_version, tipos_habilitados),
        # Sin criterios: la suite mide la recuperación y la generación; la aplicabilidad se mide en US-132 (M-08.2).
        aplicabilidad=ApplicabilityService(CriteriosDelCatalogo({})),
        proponente=adaptadores.proponente,
        generador=GeneradorObservado(adaptadores.generador, cronometro, observaciones),
        clasificador_nli=nli,
        verificador_terminos=terminos,
        reloj=reloj,
        parametros=parametros_de_recuperacion(config, tipos_habilitados),
    )
    return ServicioDeSuite(
        servicio,
        observaciones,
        cronometro,
        config.catalogo_version,
        VerificadorEstricto(lista),
        terminos,
        JuezNli(
            adaptadores.clasificador_nli, config.umbrales.nli_entailment_threshold
        ),  # sin cronómetro: no es la etapa «nli»
        juez_llm,
        nli.latencias,
    )
