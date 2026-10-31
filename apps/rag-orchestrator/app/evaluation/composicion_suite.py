"""Composición del ``RAGOrchestratorService`` de la suite: adapters falsos o locales, cronometrados y observados."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace

from app.application.aplicabilidad import ApplicabilityService
from app.application.ports import (
    ApplicabilityTextProposer,
    Clock,
    EvidenceGenerator,
    LanguageDetector,
    NliClassifier,
    ProhibitedTermsChecker,
    QueryEmbedder,
    FalloDeInferencia,
    QuerySparseEncoder,
    Reranker,
    SparseChunkSearch,
)
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
)
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
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.juez_fidelidad import JuezFidelidad, JuezNli, JuezSecundario
from app.evaluation.lenguaje_estricto import VerificadorEstricto
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
from app.evaluation.modelos_locales import PuertosLocales
from app.infrastructure.catalogo_clinico.aplicabilidad import CriteriosDelCatalogo
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.fake.fake_applicability_text_proposer import ProponenteSilencioso
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


def parametros_de_recuperacion(
    config: ConfigSuite, tipos_habilitados: tuple[str, ...], brazo: Brazo | None = None
) -> ParametrosDeRecuperacion:
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
    )
    return base if brazo is None else _con_recuperacion_del_brazo(base, brazo)


def _con_recuperacion_del_brazo(
    parametros: ParametrosDeRecuperacion, brazo: Brazo
) -> ParametrosDeRecuperacion:
    """``RETRIEVAL_*`` del brazo sobre los valores por defecto del servicio (*dense*)."""
    return replace(
        parametros,
        retrieval_mode=brazo.modo,
        retrieval_fusion=brazo.fusion or parametros.retrieval_fusion,
        rrf_k=brazo.rrf_k or parametros.rrf_k,
        peso_sparse=brazo.peso_sparse or parametros.peso_sparse,
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
    proponente: ApplicabilityTextProposer
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
        proponente=ProponenteSilencioso(),
        codificador_sparse=sparse,
        buscador_sparse=BuscadorSparseEnMemoria(
            dataset, [sparse.vector_de(c.texto) for c in dataset.chunks]
        ),
    )


def _adaptadores_locales(puertos: PuertosLocales, dataset: DatasetSuite) -> Adaptadores:
    return Adaptadores(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        vectores_de_chunks=puertos.embedder_pasajes.embeber([c.texto for c in dataset.chunks]),
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
    except FalloDeInferencia:
        return {}


def adaptadores_de_suite(
    config: ConfigSuite, dataset: DatasetSuite, puertos_locales: PuertosLocales | None
) -> Adaptadores:
    if config.proveedor == "fake":
        return _adaptadores_falsos(dataset)
    if puertos_locales is None:
        raise ConfigInvalida("adaptadores.proveedor: local exige los puertos reales ya cargados")
    return _adaptadores_locales(puertos_locales, dataset)


def _rama_sparse(
    adaptadores: Adaptadores,
    brazo: Brazo | None,
    cronometro: Cronometro,
    observaciones: Observaciones,
) -> tuple[CodificadorSparseObservado | None, BuscadorSparseMedido | None]:
    """Los puertos *sparse* medidos, solo para un brazo híbrido: el servicio los exige y un brazo *dense* no los toca."""
    if brazo is None or brazo.modo is RetrievalMode.dense:
        return None, None
    if adaptadores.codificador_sparse is None or adaptadores.buscador_sparse is None:
        raise ConfigInvalida("un brazo híbrido exige el codificador y la búsqueda sparse")
    return (
        CodificadorSparseObservado(adaptadores.codificador_sparse, cronometro, observaciones),
        BuscadorSparseMedido(adaptadores.buscador_sparse, cronometro),
    )


def componer_servicio(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    juez_llm: JuezSecundario | None = None,
    puertos_locales: PuertosLocales | None = None,
    brazo: Brazo | None = None,
    adaptadores: Adaptadores | None = None,
) -> ServicioDeSuite:
    """El servicio de la suite. Con ``brazo`` recupera con sus ``RETRIEVAL_*`` (US-133); con ``adaptadores`` ya cargados
    (los mismos modelos y el mismo índice para todos los brazos) no vuelve a cargar ni a indexar nada."""
    adaptadores = adaptadores or adaptadores_de_suite(config, dataset, puertos_locales)
    observaciones = Observaciones()
    nli = NliMedido(adaptadores.clasificador_nli, cronometro)
    lista = cargar_lista_de_terminos(config.ruta_terminos)  # se lee y valida una sola vez
    terminos = VerificadorDeTerminosProhibidos(lista)
    # La suite habilita los tipos del catálogo montado (RN-20): el dataset no restringe el tipo y la huella no cambia.
    tipos_habilitados = cargar_catalogo_del_manifiesto(config.ruta_terminos).tipos_de_cancer()
    embedder_sparse, buscador_sparse = _rama_sparse(adaptadores, brazo, cronometro, observaciones)
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
        parametros=parametros_de_recuperacion(config, tipos_habilitados, brazo),
        embedder_sparse=embedder_sparse,
        buscador_sparse=buscador_sparse,
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
