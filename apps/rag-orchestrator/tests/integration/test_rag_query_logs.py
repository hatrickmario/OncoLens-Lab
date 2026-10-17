"""No-fuga en logs de `/rag/query` (US-055, tarea 2.13): ni la pregunta, ni el contexto, ni el seudónimo, ni los chunks."""

import logging

import pytest

from tests.support.recuperacion import (
    CORPUS_FX06A,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
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


@pytest.mark.parametrize(
    "escenario", ["con_evidencia", "sin_evidencia", "milvus_caido", "tipo_de_cancer_ausente"]
)
def test_rag_query_no_registra_pregunta_contexto_seudonimo_ni_chunks_en_los_logs(
    escenario, caplog
):
    pregunta = Q_SIN if escenario == "sin_evidencia" else Q_HER2
    solicitud = _solicitud_con_pii_sembrada(pregunta)
    if escenario == "milvus_caido":
        entorno = crear_entorno(
            buscador=BuscadorFalso(error=RuntimeError(f"{SENTINELA_FALLO} {pregunta}"))
        )
    else:
        entorno = crear_entorno()
    if escenario == "tipo_de_cancer_ausente":
        solicitud["clinicalContext"]["diagnosis"] = None
    caplog.set_level(logging.DEBUG)

    entorno.consultar(solicitud)

    assert caplog.records, "el escenario debe dejar al menos un log para que la comprobación sea significativa"
    for registro in caplog.records:
        texto = registro.getMessage() + (registro.exc_text or "")
        for prohibido in _prohibidos(solicitud):
            assert prohibido not in texto, f"{registro.name}: {prohibido!r} aparece en un log"
