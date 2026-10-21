"""Bordes de las citas de `/rag/query` (L1D-179): catálogo caído o incompleto y no-fuga en logs (tarea 2.11)."""

import logging

from tests.support.generador_falso import TITULO_INVENTADO, FakeEvidenceGenerator
from tests.support.recuperacion import (
    CORPUS_FX06A,
    FICHAS_FX06A,
    Q_HER2,
    CatalogoFalso,
    crear_entorno,
    solicitud_de,
)

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
SENTINELA_CATALOGO = "SENTINELA-HOST-CATALOGO-pg.test:5432"


def test_rag_query_responde_503_de_recuperacion_sin_eco_cuando_el_catalogo_falla(caplog):
    entorno = crear_entorno(catalogo=CatalogoFalso(error=RuntimeError(SENTINELA_CATALOGO)))
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert SENTINELA_CATALOGO not in respuesta.text
    assert all(SENTINELA_CATALOGO not in r.getMessage() for r in caplog.records)


def test_rag_query_descarta_con_cita_invalida_la_opcion_cuyo_documento_no_esta_en_el_catalogo():
    sin_doc_m1 = {d: f for d, f in FICHAS_FX06A.items() if d != "doc-m1"}
    entorno = crear_entorno(catalogo=CatalogoFalso(fichas=sin_doc_m1))

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["cita_invalida"]


def test_rag_query_usa_como_relevance_score_de_la_opcion_el_puntaje_del_reranker_de_su_cita():
    entorno = crear_entorno()

    cuerpo = entorno.consultar(solicitud_de(Q_HER2)).json()

    assert cuerpo["evidenceOptions"][0]["relevanceScore"] == 0.87
    assert cuerpo["topRelevanceScore"] == 0.87


def test_rag_query_solo_registra_conteos_de_citas_cuando_valida_citas_en_los_logs(caplog):
    solicitud = solicitud_de(Q_HER2)
    entorno = crear_entorno(generador=FakeEvidenceGenerator("LLM-TITULO-FALSO"))
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    mensajes = [r.getMessage() for r in caplog.records]
    assert any("event=rag_query_citas" in m and "opcionesAceptadas=1" in m for m in mensajes)
    prohibidos = [
        solicitud["query"],
        solicitud["clinicalContext"]["pseudoPatientId"],
        TITULO_INVENTADO,
        *(chunk.texto for chunk in CORPUS_FX06A),
    ]
    for mensaje in mensajes:
        for prohibido in prohibidos:
            assert prohibido not in mensaje
