"""Corrida de la suite: cada pregunta pasa por ``RAGOrchestratorService`` en proceso y deja un ``ResultadoConsulta``."""

from __future__ import annotations

import copy
import json
from typing import Any

from app.domain.citations import validar_citas
from app.evaluation.composicion_suite import ServicioDeSuite
from app.evaluation.dataset_loader import Pregunta
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.retrieval_metrics import evaluar_pregunta
from app.evaluation.rutas import raiz_repo
from app.schemas.generated.models import (
    DataClassification,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
)

SOLICITUD_BASE = "contracts/examples/rag-query-request.json"
MAX_OPCIONES = 3


def _solicitud_base() -> dict[str, Any]:
    return json.loads((raiz_repo() / SOLICITUD_BASE).read_text(encoding="utf-8"))


def solicitud_de(
    base: dict[str, Any], pregunta: Pregunta, clase: str, indice: int, catalogo_version: str
) -> RagQueryInternalRequest:
    """La solicitud de ``contracts/examples`` con la pregunta del dataset; el ``traceId`` es el índice (sin azar)."""
    cruda = copy.deepcopy(base)
    cruda["traceId"] = f"req_eval{indice:04d}"
    cruda["query"] = pregunta.texto
    cruda["maxOptions"] = MAX_OPCIONES
    cruda["catalogVersion"] = (
        catalogo_version  # NFR-14: la solicitud usa el catálogo de la configuración
    )
    cruda["dataClassification"] = DataClassification(clase).value
    cruda["clinicalContext"]["diagnosis"]["cancerType"] = pregunta.cancer
    return RagQueryInternalRequest.model_validate(cruda)


async def evaluar_dataset(
    suite: ServicioDeSuite, dataset: DatasetSuite
) -> tuple[list[ResultadoConsulta], list[RagQueryInternalResponse]]:
    base = _solicitud_base()
    resultados: list[ResultadoConsulta] = []
    respuestas: list[RagQueryInternalResponse] = []
    for indice, pregunta in enumerate(dataset.preguntas):
        solicitud = solicitud_de(base, pregunta, dataset.clase, indice, suite.catalogo_version)
        generaciones_previas = suite.observaciones.generaciones
        respuesta = await suite.cronometro.medir_async(
            "consulta", suite.servicio.consultar, solicitud
        )
        invocado = suite.observaciones.generaciones > generaciones_previas
        resultados.append(_resultado_de(suite, dataset, pregunta, respuesta, invocado))
        respuestas.append(respuesta)
    return resultados, respuestas


def _resultado_de(
    suite: ServicioDeSuite,
    dataset: DatasetSuite,
    pregunta: Pregunta,
    respuesta: RagQueryInternalResponse,
    generador_invocado: bool,
) -> ResultadoConsulta:
    obs = suite.observaciones
    propuesta = obs.propuestas.get(pregunta.texto)
    citas_propuestas = citas_validas = 0
    if generador_invocado and propuesta is not None:
        revisadas = validar_citas(propuesta.opciones, obs.entregados[pregunta.texto])
        citas_validas = sum(len(a.chunk_ids_validos) for a in revisadas.aceptadas)
        citas_propuestas = sum(len(set(o.chunk_ids_citados)) for o in propuesta.opciones)
    top = respuesta.topRelevanceScore
    return ResultadoConsulta(
        recuperacion=evaluar_pregunta(pregunta, obs.rankings.get(pregunta.texto, [])),
        revisada=pregunta.id in dataset.revisadas,
        esperaba_sin_evidencia=pregunta.modo_acierto == "sin_evidencia",
        sin_evidencia=respuesta.status == RagQueryStatus.sin_evidencia,
        generador_invocado=generador_invocado,
        top_relevance_score=None if top is None else float(top),
        citas_propuestas=citas_propuestas,
        citas_validas=citas_validas,
        opciones_mostradas=len(respuesta.evidenceOptions),
        opciones_descartadas=len(respuesta.discardedOptions),
    )
