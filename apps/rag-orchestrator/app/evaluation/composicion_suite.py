"""Composición del ``RAGOrchestratorService`` de la suite: adapters falsos o locales, cronometrados y observados."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace

from app.application.aplicabilidad import ApplicabilityService
from app.application.aplicabilidad_textual import ParametrosDelRespaldo
from app.application.ports import (
    ChunkSearch,
    Clock,
    CorpusCatalogReader,
    EvidenceGenerator,
    FalloDeInferencia,
    LanguageDetector,
    NliClassifier,
    PoblacionTask,
    ProhibitedTermsChecker,
    PuertosDelCorpus,
    QueryEmbedder,
    QuerySparseEncoder,
    Reranker,
    SinTerminosLexicos,
    SparseChunkSearch,
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
from app.domain.criterios_aplicabilidad import CriteriosDeAplicabilidad
from app.domain.expansion_contextual import ParametrosDeExpansionContextual
from app.domain.pregunta_sin_tema_propio import MarcosDePregunta
from app.domain.terminos_del_caso import CatalogoDeTerminos
from app.domain.ventanas_del_reranker import ConfiguracionDelReranker
from app.evaluation.adaptadores_falsos import (
    BuscadorEnMemoria,
    BuscadorSparseEnMemoria,
    CatalogoClinicoDeConfig,
    CatalogoEnMemoria,
    CodificadorSparseLexico,
    EmbedderBolsaDePalabras,
    GeneradorGuionado,
    LectorReleaseFijo,
    NliLexico,
    RerankerLexico,
)
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.config_suite import ConfigInvalida, ConfigSuite
from app.evaluation.cronometro import Cronometro
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.juez_fidelidad import JuezFidelidad, JuezNli, JuezSecundario
from app.evaluation.juez_no_inferencia import JuezDeNoInferencia, MedidorDeNoInferencia
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.lenguaje_linea_base import verificador_de_la_linea_base
from app.evaluation.medidores import (
    BuscadorMedido,
    BuscadorSparseMedido,
    CatalogoMedido,
    CodificadorSparseObservado,
    DetectorMedido,
    EmbedderMedido,
    GeneradorObservado,
    LatenciasNli,
    LectorReleaseMedido,
    NliMedido,
    Observaciones,
    RerankerObservado,
)
from app.evaluation.metricas.rechazos_legitimos import ids_de_preguntas_de_control_legitimo
from app.evaluation.modelos_locales import PuertosLocales
from app.infrastructure.catalogo_clinico.aplicabilidad import CriteriosDelCatalogo
from app.infrastructure.catalogo_clinico.datos_criticos import cargar_datos_criticos
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.fake.tarea_de_poblacion_silenciosa import TareaDePoblacionSilenciosa
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.lenguaje.terminos_prohibidos import (
    VerificadorDeTerminosProhibidos,
    cargar_lista_de_terminos,
)
from app.schemas.generated.models import LlmProvider, RetrievalMode

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
    claim_max_words: int
    """``CLAIM_MAX_WORDS`` de la suite: el mismo que usa el verificador del servicio (RN-22)."""
    verificador_linea_base: ProhibitedTermsChecker | None = None
    """El filtro de la línea base de US-068 (lista 1.5.0, solo Nivel A) para la regresión de falsos positivos (US-249 AC-5)."""
    no_inferencia: MedidorDeNoInferencia | None = None
    """El juez acotado y las etiquetas de los faltantes (US-116 AC-1); ``None`` = la no inferencia no se mide."""


@dataclass(frozen=True)
class AplicabilidadDeLaSuite:
    """Lo que la familia `opciones` (US-140) inyecta para que el servicio evalúe la aplicabilidad: los criterios del
    catálogo y el catálogo del corpus con la población de cada documento."""

    criterios: CriteriosDeAplicabilidad
    catalogo: CorpusCatalogReader


@dataclass(frozen=True)
class ExpansionDeLaSuite:
    """Lo que la familia `contextual` (US-271) inyecta para que el servicio decida el segundo loop contextual (ADR-52): el
    indicador y los dos catálogos de solo lectura (marcos de pregunta y términos del caso). Sin ella el servicio no tiene
    catálogo de términos y nunca corre ese loop: las demás familias y `--suite all` no lo miden (D6-60)."""

    parametros: ParametrosDeExpansionContextual
    marcos: MarcosDePregunta
    terminos: CatalogoDeTerminos


PARAMETROS_DEL_RESPALDO_DE_LA_SUITE = ParametrosDelRespaldo(
    plazo_ms=POBLACION_PLAZO_DEL_RESPALDO_MS_INICIAL,
    concurrencia=POBLACION_CONCURRENCIA_INICIAL,
    version_del_prompt=POBLACION_VERSION_DEL_PROMPT_INICIAL,
)
"""El respaldo de la población con adapters FALSOS: ni el plazo ni la concurrencia cambian la medida. La suite local usa el que
derivan de ``Settings`` los puertos locales (``PuertosLocales.respaldo``, RN-22)."""


def parametros_de_recuperacion(
    config: ConfigSuite,
    tipos_habilitados: tuple[str, ...],
    brazo: Brazo | None = None,
    respaldo: ParametrosDelRespaldo = PARAMETROS_DEL_RESPALDO_DE_LA_SUITE,
    reranker_max_pairs: int | None = None,
    expansion: ExpansionDeLaSuite | None = None,
) -> ParametrosDeRecuperacion:
    """Los parámetros del servicio de la suite; ``reranker_max_pairs`` solo lo fija un reranker local (``None`` = sin tope).
    Sin ``expansion`` el loop contextual queda apagado (como en las demás familias); con ella, el indicador de la corrida."""
    u = config.umbrales
    base = ParametrosDeRecuperacion(
        relevance_threshold=u.relevance_threshold,
        retrieval_top_k=u.retrieval_top_k,
        rerank_top_n=u.rerank_top_n,
        longitud_maxima_codigo_tipo=LONGITUD_MAXIMA_CODIGO_TIPO,
        llm_provider=LlmProvider.local,
        llm_model=config.llm_modelo,
        nli_entailment_threshold=u.nli_entailment_threshold,
        tipos_habilitados=tipos_habilitados,
        claim_max_words=u.claim_max_words,
        respaldo=respaldo,
        reranker_max_pairs=reranker_max_pairs,
    )
    if expansion is not None:
        base = replace(base, expansion_contextual=expansion.parametros)
    return base if brazo is None else _con_recuperacion_del_brazo(base, brazo)


def _con_recuperacion_del_brazo(
    parametros: ParametrosDeRecuperacion, brazo: Brazo
) -> ParametrosDeRecuperacion:
    """``RETRIEVAL_*`` del brazo sobre los valores por defecto del servicio (*dense*)."""
    return replace(
        parametros,
        retrieval_mode=brazo.modo,
        retrieval_fusion=(parametros.retrieval_fusion if brazo.fusion is None else brazo.fusion),
        rrf_k=parametros.rrf_k if brazo.rrf_k is None else brazo.rrf_k,
        peso_sparse=parametros.peso_sparse if brazo.peso_sparse is None else brazo.peso_sparse,
    )


@dataclass(frozen=True)
class Adaptadores:
    """Los puertos que cambian entre ``fake`` y ``local``; el resto del servicio es el mismo."""

    detector_idioma: LanguageDetector
    embedder: QueryEmbedder
    vectores_de_chunks: Sequence[Sequence[float]]
    reranker: Reranker
    generador: EvidenceGenerator
    clasificador_nli: NliClassifier
    proponente: PoblacionTask
    codificador_sparse: QuerySparseEncoder | None = None
    """La rama *sparse* (US-133): el codificador de la consulta y la búsqueda sobre los mismos chunks que la *dense*."""
    buscador_sparse: SparseChunkSearch | None = None


def _adaptadores_falsos(dataset: DatasetSuite) -> Adaptadores:
    embedder = EmbedderBolsaDePalabras()
    sparse = CodificadorSparseLexico()
    return Adaptadores(
        detector_idioma=DetectorDeIdiomaLocal("es"),
        embedder=embedder,
        vectores_de_chunks=[embedder.embeber(c.texto) for c in dataset.chunks],
        reranker=RerankerLexico(),
        generador=GeneradorGuionado(dataset),
        clasificador_nli=NliLexico(),
        proponente=TareaDePoblacionSilenciosa(),
        codificador_sparse=sparse,
        buscador_sparse=BuscadorSparseEnMemoria(
            dataset, [sparse.vector_de(c.texto) for c in dataset.chunks]
        ),
    )


def _adaptadores_locales(
    puertos: PuertosLocales, dataset: DatasetSuite, con_indice_de_corpus: bool
) -> Adaptadores:
    """Con el corpus leído de un índice (``l1d-119``) los vectores ya están allí: no se embeben los chunks del dataset."""
    if con_indice_de_corpus:
        dataset = replace(dataset, chunks=())
    vectores = (
        []
        if con_indice_de_corpus
        else puertos.embedder_pasajes.embeber([c.texto for c in dataset.chunks])
    )
    return Adaptadores(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        vectores_de_chunks=vectores,
        reranker=puertos.reranker,
        generador=puertos.generador,
        clasificador_nli=puertos.clasificador_nli,
        proponente=puertos.proponente,  # el de producción: la suite local no usa el silencioso
        codificador_sparse=puertos.embedder_sparse,
        buscador_sparse=_buscador_sparse_local(puertos.embedder_sparse, dataset),
    )


def _buscador_sparse_local(
    codificador: QuerySparseEncoder | None, dataset: DatasetSuite
) -> SparseChunkSearch | None:
    """La búsqueda *sparse* sobre los vectores BGE-M3 de los chunks, con el MISMO codificador que la consulta (US-112 D6).

    Un chunk sin ningún término con peso queda con vector vacío (no aporta a la rama), igual que en la ingesta."""
    if codificador is None:
        return None
    vectores = [_vector_sparse_o_vacio(codificador, c.texto) for c in dataset.chunks]
    return BuscadorSparseEnMemoria(dataset, vectores)


def _vector_sparse_o_vacio(codificador: QuerySparseEncoder, texto: str) -> dict[int, float]:
    try:
        return dict(codificador.embeber_sparse(texto))
    except SinTerminosLexicos:
        return {}
    except (
        FalloDeInferencia
    ):  # un codificador roto no se disfraza de chunk sin términos: la corrida no es válida
        raise SuiteAbortada("falló la codificación sparse de los chunks del índice") from None


def adaptadores_de_suite(
    config: ConfigSuite,
    dataset: DatasetSuite,
    puertos_locales: PuertosLocales | None,
    corpus: PuertosDelCorpus | None = None,
) -> Adaptadores:
    if config.proveedor == "fake":
        return _adaptadores_falsos(dataset)
    if puertos_locales is None:
        raise ConfigInvalida("adaptadores.proveedor: local exige los puertos reales ya cargados")
    return _adaptadores_locales(puertos_locales, dataset, corpus is not None)


def _rama_sparse(
    adaptadores: Adaptadores,
    buscador_sparse: SparseChunkSearch | None,
    brazo: Brazo | None,
    cronometro: Cronometro,
    observaciones: Observaciones,
) -> tuple[CodificadorSparseObservado | None, BuscadorSparseMedido | None]:
    """Los puertos *sparse* medidos, solo para un brazo híbrido: el servicio los exige y un brazo *dense* no los toca."""
    if brazo is None or brazo.modo is RetrievalMode.dense:
        return None, None
    if adaptadores.codificador_sparse is None or buscador_sparse is None:
        raise ConfigInvalida("un brazo híbrido exige el codificador y la búsqueda sparse")
    return (
        CodificadorSparseObservado(adaptadores.codificador_sparse, cronometro, observaciones),
        BuscadorSparseMedido(buscador_sparse, cronometro),
    )


def _reranker_del_brazo(base: Reranker, brazo: Brazo | None) -> Reranker:
    """El reranker del brazo (US-278): la misma sesión y el mismo tokenizador con la etapa que el brazo declara; sin
    campos del reranker en el brazo, el reranker de la suite tal cual (la huella y el resultado de A0 no cambian)."""
    if brazo is None or not brazo.cambia_el_reranker:
        return base
    variante = getattr(base, "variante", None)
    if variante is None:
        raise ConfigInvalida("el reranker de la suite no admite variantes por brazo (RERANKER_*)")
    return variante(  # type: ignore[no-any-return]
        modo_de_ventanas=brazo.reranker_modo,
        solape=brazo.reranker_solape,
        max_length=brazo.reranker_max_length,
    )


def _etapa_esperada_del_reranker(
    base: Reranker, brazo: Brazo | None
) -> ConfiguracionDelReranker | None:
    """Lo que el brazo declaró sobre la etapa y, para lo que no declaró, lo que ya traía el reranker de la suite."""
    if brazo is None or not brazo.cambia_el_reranker:
        return None
    de_la_suite = getattr(base, "configuracion", None)
    if de_la_suite is None:
        raise ConfigInvalida("el reranker de la suite no expone su configuración (RERANKER_*)")
    return replace(
        de_la_suite,
        modo=brazo.reranker_modo or de_la_suite.modo,
        solape=de_la_suite.solape if brazo.reranker_solape is None else brazo.reranker_solape,
        max_length=de_la_suite.max_length
        if brazo.reranker_max_length is None
        else brazo.reranker_max_length,
    )


def _catalogo_de(
    aplicabilidad: AplicabilidadDeLaSuite | None,
    corpus: PuertosDelCorpus | None,
    dataset: DatasetSuite,
) -> CorpusCatalogReader:
    """El catálogo del corpus: el de la familia `opciones`, el del índice leído o el del dataset en memoria."""
    if aplicabilidad is not None:
        return aplicabilidad.catalogo
    return corpus.catalogo if corpus is not None else CatalogoEnMemoria(dataset)


def componer_servicio(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    juez_llm: JuezSecundario | None = None,
    puertos_locales: PuertosLocales | None = None,
    brazo: Brazo | None = None,
    adaptadores: Adaptadores | None = None,
    aplicabilidad: AplicabilidadDeLaSuite | None = None,
    corpus: PuertosDelCorpus | None = None,
    envolver_buscador: Callable[[ChunkSearch], ChunkSearch] | None = None,
    reranker_max_pairs: int | None = None,
    expansion: ExpansionDeLaSuite | None = None,
    juez_no_inferencia: JuezDeNoInferencia | None = None,
) -> ServicioDeSuite:
    """El servicio de la suite. Con ``brazo`` recupera con sus ``RETRIEVAL_*`` (US-133); con ``adaptadores`` ya cargados
    (los mismos modelos y el mismo índice para todos los brazos) no vuelve a cargar ni a indexar nada. Con
    ``aplicabilidad`` (familia `opciones`, US-140) el servicio calcula la aplicabilidad por fuente con esos criterios y
    esa población; sin ella, la suite mide solo la recuperación y la generación. ``envolver_buscador`` decora la búsqueda
    en memoria (la familia `diagnostico` observa el orden denso) y ``reranker_max_pairs`` fija el corte a los pares con
    adaptadores falsos; con puertos locales manda el del reranker cargado. Con ``corpus`` (fuente ``indice``) el servicio
    busca y lee el catálogo y la release en esos puertos de solo lectura, no en el dataset en memoria. Con ``expansion``
    (familia `contextual`, US-271) el servicio decide el segundo loop contextual con esos catálogos y su indicador. Con
    ``juez_no_inferencia`` la suite cuenta las salidas que atribuyen un valor a un dato crítico faltante (US-116 AC-1)."""
    if aplicabilidad is not None and corpus is not None:
        raise ConfigInvalida(
            "la aplicabilidad de la suite y el corpus de un índice son excluyentes: cada uno trae su catálogo"
        )
    adaptadores = adaptadores or adaptadores_de_suite(config, dataset, puertos_locales, corpus)
    observaciones = Observaciones(
        esperada_del_reranker=_etapa_esperada_del_reranker(adaptadores.reranker, brazo)
    )
    nli = NliMedido(adaptadores.clasificador_nli, cronometro)
    lista = cargar_lista_de_terminos(config.ruta_terminos)  # se lee y valida una sola vez
    terminos = VerificadorDeTerminosProhibidos(lista)
    # La suite habilita los tipos del catálogo montado (RN-20): el dataset no restringe el tipo y la huella no cambia.
    tipos_habilitados = cargar_catalogo_del_manifiesto(config.ruta_terminos).tipos_de_cancer()
    buscador_sparse_del_corpus = (
        corpus.buscador_sparse if corpus is not None else adaptadores.buscador_sparse
    )
    embedder_sparse, buscador_sparse = _rama_sparse(
        adaptadores, buscador_sparse_del_corpus, brazo, cronometro, observaciones
    )
    buscador: ChunkSearch = (
        corpus.buscador
        if corpus is not None
        else BuscadorEnMemoria(dataset, adaptadores.vectores_de_chunks)
    )
    if envolver_buscador is not None:
        buscador = envolver_buscador(buscador)
    datos_criticos = cargar_datos_criticos(config.ruta_terminos, tipos_habilitados)
    servicio = RAGOrchestratorService(
        detector_idioma=DetectorMedido(adaptadores.detector_idioma, cronometro),
        embedder=EmbedderMedido(adaptadores.embedder, cronometro),
        buscador=BuscadorMedido(buscador, cronometro),
        reranker=RerankerObservado(
            _reranker_del_brazo(adaptadores.reranker, brazo), cronometro, observaciones
        ),
        lector_release=LectorReleaseMedido(
            corpus.lector_release if corpus is not None else LectorReleaseFijo(dataset), cronometro
        ),
        catalogo=CatalogoMedido(
            _catalogo_de(aplicabilidad, corpus, dataset),
            cronometro,
        ),
        catalogo_clinico=CatalogoClinicoDeConfig(config.catalogo_version, tipos_habilitados),
        datos_criticos=datos_criticos,
        # Sin ``aplicabilidad`` la suite no calcula criterios (mide recuperación y generación; M-08.2 es de US-132); con ella
        # (familia `opciones`, US-140) el servicio evalúa la aplicabilidad por fuente.
        aplicabilidad=ApplicabilityService(
            aplicabilidad.criterios if aplicabilidad else CriteriosDelCatalogo({})
        ),
        proponente=adaptadores.proponente,
        generador=GeneradorObservado(adaptadores.generador, cronometro, observaciones),
        clasificador_nli=nli,
        verificador_terminos=terminos,
        reloj=reloj,
        parametros=parametros_de_recuperacion(
            config,
            tipos_habilitados,
            brazo,
            puertos_locales.respaldo if puertos_locales else PARAMETROS_DEL_RESPALDO_DE_LA_SUITE,
            puertos_locales.reranker_max_pairs if puertos_locales else reranker_max_pairs,
            expansion,
        ),
        embedder_sparse=embedder_sparse,
        buscador_sparse=buscador_sparse,
        marcos_de_pregunta=expansion.marcos if expansion else None,
        catalogo_de_terminos=expansion.terminos if expansion else None,
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
        config.umbrales.claim_max_words,
        _filtro_de_la_linea_base(dataset),
        no_inferencia=(
            None
            if juez_no_inferencia is None
            else MedidorDeNoInferencia(juez_no_inferencia, datos_criticos)
        ),
    )


def _filtro_de_la_linea_base(dataset: DatasetSuite) -> ProhibitedTermsChecker | None:
    """El filtro de US-068 (lista 1.5.0, solo Nivel A) si el dataset la declara; un dataset con salidas legítimas la exige."""
    if dataset.linea_base_de_lenguaje is not None:
        return verificador_de_la_linea_base(dataset.linea_base_de_lenguaje)
    if ids_de_preguntas_de_control_legitimo(dataset):
        raise DatasetInvalido("el dataset con salidas legítimas no declara linea_base_de_lenguaje")
    return None
