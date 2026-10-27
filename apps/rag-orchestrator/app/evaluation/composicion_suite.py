"""Composición del ``RAGOrchestratorService`` de la suite con adapters falsos, cronometrados y observados."""

from __future__ import annotations

from dataclasses import dataclass

from app.application.aplicabilidad import ApplicabilityService
from app.application.ports import Clock, ProhibitedTermsChecker
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
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
from app.evaluation.juez_fidelidad import JuezFidelidad, JuezNli
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.medidores import (
    BuscadorMedido,
    CatalogoMedido,
    DetectorMedido,
    EmbedderMedido,
    GeneradorObservado,
    LectorReleaseMedido,
    NliMedido,
    Observaciones,
    RerankerObservado,
)
from app.infrastructure.catalogo_clinico.aplicabilidad import CriteriosDelCatalogo
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
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
    juez_llm: JuezFidelidad | None


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
    )


def componer_servicio(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    juez_llm: JuezFidelidad | None = None,
) -> ServicioDeSuite:
    if config.proveedor != "fake":
        raise ConfigInvalida("adaptadores.proveedor: local se cablea con US-073")
    observaciones = Observaciones()
    embedder = EmbedderBolsaDePalabras()
    nli = NliLexico()
    lista = cargar_lista_de_terminos(config.ruta_terminos)  # se lee y valida una sola vez
    terminos = VerificadorDeTerminosProhibidos(lista)
    # La suite habilita los tipos del catálogo montado (RN-20): el dataset no restringe el tipo y la huella no cambia.
    tipos_habilitados = cargar_catalogo_del_manifiesto(config.ruta_terminos).tipos_de_cancer()
    servicio = RAGOrchestratorService(
        detector_idioma=DetectorMedido(DetectorDeIdiomaLocal("es"), cronometro),
        embedder=EmbedderMedido(embedder, cronometro),
        buscador=BuscadorMedido(BuscadorEnMemoria(dataset, embedder), cronometro),
        reranker=RerankerObservado(RerankerLexico(), cronometro, observaciones),
        lector_release=LectorReleaseMedido(LectorReleaseFijo(dataset), cronometro),
        catalogo=CatalogoMedido(CatalogoEnMemoria(dataset), cronometro),
        catalogo_clinico=CatalogoClinicoDeConfig(config.catalogo_version, tipos_habilitados),
        # Sin criterios: la suite mide la recuperación y la generación; la aplicabilidad se mide en US-132 (M-08.2).
        aplicabilidad=ApplicabilityService(CriteriosDelCatalogo({})),
        generador=GeneradorObservado(GeneradorGuionado(dataset), cronometro, observaciones),
        clasificador_nli=NliMedido(nli, cronometro),
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
            nli, config.umbrales.nli_entailment_threshold
        ),  # sin cronómetro: no es la etapa «nli»
        juez_llm,
    )
