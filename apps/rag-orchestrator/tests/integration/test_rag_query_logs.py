"""No-fuga en logs de `/rag/query` (US-055, tarea 2.13): ni la pregunta, ni el contexto, ni el seudónimo, ni los chunks."""

import logging

import pytest

from tests.support.recuperacion import (
    CORPUS_FX06A,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
    DetectorIdiomaFalso,
    RerankerFalso,
    crear_entorno,
    solicitud_de,
)

SENTINELA_HISTOLOGIA = "SENTINELA-HISTOLOGIA-9X"
SENTINELA_BIOMARCADOR = "SENTINELA-BIOMARCADOR-7Q"
SENTINELA_FALLO = "SENTINELA-HOST-INTERNO-milvus.test:19530"


def _solicitud_con_pii_sembrada(pregunta: str) -> dict:
    """FX-T4a-a (sintética): texto libre del contexto con centinelas que no deben aparecer en ningún log."""
    solicitud = solicitud_de(pregunta)
    contexto = solicitud["clinicalContext"]
    contexto["diagnosis"]["histology"] = SENTINELA_HISTOLOGIA
    contexto["biomarkers"][0]["value"] = SENTINELA_BIOMARCADOR
    return solicitud


def _prohibidos(solicitud: dict) -> list[str]:
    contexto = solicitud["clinicalContext"]
    return [
        solicitud["query"],
        contexto["pseudoPatientId"],
        SENTINELA_HISTOLOGIA,
        SENTINELA_BIOMARCADOR,
        SENTINELA_FALLO,
        *(chunk.texto for chunk in CORPUS_FX06A),
    ]


class _RerankerQueDevuelveNone(RerankerFalso):
    def puntuar(self, pregunta, candidatos):
        return None


ESCENARIOS = [
    "con_evidencia",
    "sin_evidencia",
    "milvus_caido",
    "tipo_de_cancer_ausente",
    "detector_falla_con_el_texto_en_el_mensaje",
    "reranker_devuelve_none",
    "cancer_type_hostil",
]


def _entorno_del_escenario(escenario: str, pregunta: str, solicitud: dict):
    fallo = RuntimeError(f"{SENTINELA_FALLO} {pregunta}")
    if escenario == "milvus_caido":
        return crear_entorno(buscador=BuscadorFalso(error=fallo))
    if escenario == "detector_falla_con_el_texto_en_el_mensaje":
        return crear_entorno(detector_idioma=DetectorIdiomaFalso(error=fallo))
    if escenario == "reranker_devuelve_none":
        return crear_entorno(reranker=_RerankerQueDevuelveNone())
    if escenario == "tipo_de_cancer_ausente":
        solicitud["clinicalContext"]["diagnosis"] = None
    if escenario == "cancer_type_hostil":
        solicitud["clinicalContext"]["diagnosis"]["cancerType"] = f'" or 1==1 or "{pregunta}'
    return crear_entorno()


@pytest.mark.parametrize("escenario", ESCENARIOS)
def test_rag_query_no_registra_pregunta_contexto_seudonimo_ni_chunks_en_los_logs(escenario, caplog):
    pregunta = Q_SIN if escenario == "sin_evidencia" else Q_HER2
    solicitud = _solicitud_con_pii_sembrada(pregunta)
    entorno = _entorno_del_escenario(escenario, pregunta, solicitud)
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code != 500, (
        "un fallo de un borde debe responder un código del contrato"
    )
    assert caplog.records, (
        "el escenario debe dejar al menos un log para que la comprobación sea significativa"
    )
    formateador = logging.Formatter()
    for registro in caplog.records:
        texto = registro.getMessage()
        if registro.exc_info:
            texto += formateador.formatException(registro.exc_info)
        for prohibido in _prohibidos(solicitud):
            assert prohibido not in texto, f"{registro.name}: {prohibido!r} aparece en un log"


@pytest.mark.parametrize("escenario", ["milvus_caido", "reranker_devuelve_none"])
def test_rag_query_registra_el_trace_id_del_cuerpo_cuando_falla_un_borde(escenario, caplog):
    pregunta = Q_HER2
    solicitud = _solicitud_con_pii_sembrada(pregunta)
    entorno = _entorno_del_escenario(escenario, pregunta, solicitud)
    caplog.set_level(logging.DEBUG)

    entorno.consultar(solicitud)

    fallos = [r.getMessage() for r in caplog.records if "event=" in r.getMessage()]
    assert fallos and all(f"traceId={solicitud['traceId']}" in f for f in fallos)
