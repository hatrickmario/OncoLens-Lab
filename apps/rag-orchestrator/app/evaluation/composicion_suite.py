"""Composición del ``RAGOrchestratorService`` de la suite con adapters falsos, cronometrados y observados."""

from __future__ import annotations

from dataclasses import dataclass

from app.application.ports import Clock
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
from app.evaluation.lenguaje_estricto import VerificadorEstricto, cargar_verificador_estricto
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
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from app.schemas.generated.models import LlmProvider

LONGITUD_MAXIMA_CODIGO_TIPO = 64


@dataclass(frozen=True)
class ServicioDeSuite:
    servicio: RAGOrchestratorService
    observaciones: Observaciones
    cronometro: Cronometro
    catalogo_version: str
    verificador_estricto: VerificadorEstricto


def parametros_de_recuperacion(config: ConfigSuite) -> ParametrosDeRecuperacion:
    u = config.umbrales
    return ParametrosDeRecuperacion(
        relevance_threshold=u.relevance_threshold,
        retrieval_top_k=u.retrieval_top_k,
        rerank_top_n=u.rerank_top_n,
        longitud_maxima_codigo_tipo=LONGITUD_MAXIMA_CODIGO_TIPO,
        llm_provider=LlmProvider.local,
        llm_model=config.llm_modelo,
        nli_entailment_threshold=u.nli_entailment_threshold,
    )


def componer_servicio(
    config: ConfigSuite, dataset: DatasetSuite, cronometro: Cronometro, reloj: Clock
) -> ServicioDeSuite:
    if config.proveedor != "fake":
        raise ConfigInvalida("adaptadores.proveedor: local se cablea con US-073")
    observaciones = Observaciones()
    embedder = EmbedderBolsaDePalabras()
    servicio = RAGOrchestratorService(
        detector_idioma=DetectorMedido(DetectorDeIdiomaLocal("es"), cronometro),
        embedder=EmbedderMedido(embedder, cronometro),
        buscador=BuscadorMedido(BuscadorEnMemoria(dataset, embedder), cronometro),
        reranker=RerankerObservado(RerankerLexico(), cronometro, observaciones),
        lector_release=LectorReleaseMedido(LectorReleaseFijo(dataset), cronometro),
        catalogo=CatalogoMedido(CatalogoEnMemoria(dataset), cronometro),
        catalogo_clinico=CatalogoClinicoDeConfig(config.catalogo_version),
        generador=GeneradorObservado(GeneradorGuionado(dataset), cronometro, observaciones),
        clasificador_nli=NliMedido(NliLexico(), cronometro),
        verificador_terminos=cargar_verificador_de_terminos(config.ruta_terminos),
        reloj=reloj,
        parametros=parametros_de_recuperacion(config),
    )
    return ServicioDeSuite(
        servicio,
        observaciones,
        cronometro,
        config.catalogo_version,
        cargar_verificador_estricto(config.ruta_terminos),
    )
