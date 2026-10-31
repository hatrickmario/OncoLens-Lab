"""`POST /rag/query` con el segundo loop de reescritura (US-238 / L1D-300, FX-06b-a): adapters falsos sobre FX-06a-a.

Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import logging

import pytest

from app.application.ports import SalidaDeReescrituraInvalida
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.reescritura import (
    LLM_CAIDO,
    Q_SIN_RESPUESTA,
    Q_TYPO,
    SALIDA_INVALIDA,
    TERMINO_DEL_CATALOGO,
    TERMINO_INVENTADO,
    ReescritorFalso,
    crear_entorno_de_reescritura,
    parametros_de_reescritura,
)


def _reescritura(cuerpo: dict) -> dict:
    return cuerpo["meta"]["retrievalParams"]["queryRewrite"]


@pytest.mark.ac("US-238", 1)
def test_rag_query_genera_con_el_chunk_del_segundo_loop_cuando_el_primer_loop_no_supera_el_umbral():
    entorno, reescritor, _ = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(solicitud_de(Q_TYPO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert reescritor.invocaciones == 1
    assert cuerpo["status"] == "con_evidencia"
    assert cuerpo["evidenceOptions"][0]["citedSources"][0]["chunkId"] == "ch-m1-1"
    assert entorno.generador.invocaciones == 1
    assert _reescritura(cuerpo) == {"applied": True, "reason": "disparado"}


@pytest.mark.ac("US-238", 2)
def test_rag_query_no_invoca_la_reescritura_cuando_el_primer_loop_supera_el_umbral():
    entorno, reescritor, _ = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert reescritor.invocaciones == 0
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


@pytest.mark.ac("US-238", 3)
def test_rag_query_responde_sin_evidencia_con_una_sola_reescritura_cuando_el_segundo_loop_tampoco_supera_el_umbral():
    entorno, reescritor, _ = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(solicitud_de(Q_SIN_RESPUESTA))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert cuerpo["evidenceOptions"] == []
    assert entorno.generador.invocaciones == 0
    assert reescritor.invocaciones == 1
    assert _reescritura(cuerpo) == {"applied": True, "reason": "disparado"}


@pytest.mark.ac("US-238", 4)
def test_rag_query_hace_un_solo_segundo_loop_cuando_el_llm_siempre_propone_otra_reformulacion():
    entorno, reescritor, reranker = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(solicitud_de(Q_SIN_RESPUESTA))

    assert respuesta.status_code == 200
    assert reescritor.invocaciones == 1
    assert len(reranker.preguntas) == 2  # primer loop + un solo segundo loop, nunca un tercero


def test_rag_query_no_dispara_la_reescritura_cuando_esta_desactivada_por_configuracion():
    entorno, reescritor, _ = crear_entorno_de_reescritura(
        parametros=parametros_de_reescritura(habilitada=False)
    )

    respuesta = entorno.consultar(solicitud_de(Q_TYPO))

    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert reescritor.invocaciones == 0
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disparado"}


def test_rag_query_permite_mas_de_un_segundo_loop_cuando_la_configuracion_lo_eleva():
    entorno, reescritor, reranker = crear_entorno_de_reescritura(
        parametros=parametros_de_reescritura(max_iteraciones=2)
    )

    entorno.consultar(solicitud_de(Q_SIN_RESPUESTA))

    assert reescritor.invocaciones == 2
    assert len(reranker.preguntas) == 3


@pytest.mark.ac("US-238", 5)
@pytest.mark.parametrize(
    "reescritor",
    [
        ReescritorFalso(error=LLM_CAIDO),
        ReescritorFalso(error=SALIDA_INVALIDA),
        ReescritorFalso(demora_s=1.0),
    ],
    ids=["llm_caido", "salida_invalida", "plazo_vencido"],
)
def test_rag_query_responde_sin_evidencia_con_no_disponible_cuando_la_reescritura_falla(
    reescritor, caplog
):
    caplog.set_level(logging.INFO)
    entorno, _, _ = crear_entorno_de_reescritura(reescritor=reescritor)

    respuesta = entorno.consultar(solicitud_de(Q_TYPO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disponible"}
    registros = [r for r in caplog.records if "event=rag_query_reescritura" in r.getMessage()]
    assert len(registros) == 1
    assert "reason=no_disponible" in registros[0].getMessage()
    assert Q_TYPO not in caplog.text


def test_rag_query_no_registra_el_mensaje_de_la_excepcion_cuando_la_reescritura_falla(caplog):
    caplog.set_level(logging.DEBUG)
    reescritor = ReescritorFalso(error=SalidaDeReescrituraInvalida("SENTINELA-SALIDA-LLM"))
    entorno, _, _ = crear_entorno_de_reescritura(reescritor=reescritor)

    entorno.consultar(solicitud_de(Q_TYPO))

    assert "SalidaDeReescrituraInvalida" in caplog.text
    assert "SENTINELA-SALIDA-LLM" not in caplog.text


@pytest.mark.ac("US-238", 6)
def test_rag_query_recupera_solo_con_el_termino_del_catalogo_cuando_el_llm_propone_uno_ausente():
    reescritor = ReescritorFalso((TERMINO_DEL_CATALOGO, TERMINO_INVENTADO))
    entorno, _, _ = crear_entorno_de_reescritura(reescritor=reescritor)

    entorno.consultar(solicitud_de(Q_TYPO))

    consultas = [t for t in entorno.embedder.textos if t.startswith(Q_TYPO) and t != Q_TYPO]
    assert consultas == [f"{Q_TYPO} {TERMINO_DEL_CATALOGO}"]
    assert TERMINO_INVENTADO not in " ".join(entorno.embedder.textos)


def test_rag_query_no_hace_segunda_busqueda_cuando_ningun_termino_esta_en_el_catalogo():
    reescritor = ReescritorFalso((TERMINO_INVENTADO,))
    entorno, _, reranker = crear_entorno_de_reescritura(reescritor=reescritor)

    respuesta = entorno.consultar(solicitud_de(Q_TYPO))

    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert entorno.buscador.invocaciones == 2  # solo el primer loop: pregunta y resumen
    assert len(reranker.preguntas) == 1
    assert _reescritura(cuerpo) == {"applied": False, "reason": "no_disponible"}


@pytest.mark.ac("US-238", 7)
def test_rag_query_puntua_y_responde_con_la_pregunta_original_cuando_el_segundo_loop_rescata():
    entorno, _, reranker = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(solicitud_de(Q_TYPO))

    assert respuesta.status_code == 200
    assert reranker.preguntas == [Q_TYPO, Q_TYPO]  # nunca la reformulación
    assert entorno.embedder.textos.count(f"{Q_TYPO} {TERMINO_DEL_CATALOGO}") == 1
    assert TERMINO_DEL_CATALOGO not in respuesta.text
    assert respuesta.json()["evidenceOptions"][0]["relevanceScore"] == 0.74


@pytest.mark.ac("US-238", 8)
def test_rag_query_envia_a_la_reescritura_solo_la_pregunta_recibida_y_no_registra_texto(caplog):
    caplog.set_level(logging.DEBUG)
    solicitud = solicitud_de(Q_TYPO)
    pseudo = solicitud["clinicalContext"]["pseudoPatientId"]
    entorno, reescritor, _ = crear_entorno_de_reescritura()

    entorno.consultar(solicitud)

    assert reescritor.preguntas == [Q_TYPO]
    assert pseudo not in caplog.text
    assert Q_TYPO not in caplog.text
    assert TERMINO_DEL_CATALOGO not in caplog.text
    registro = next(r for r in caplog.records if "event=rag_query_reescritura" in r.getMessage())
    assert "rewriteApplied=True" in registro.getMessage()
    assert "reason=disparado" in registro.getMessage()
    assert "latencyMs=" in registro.getMessage()
