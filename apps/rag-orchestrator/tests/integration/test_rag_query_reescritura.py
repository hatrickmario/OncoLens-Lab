"""`POST /rag/query` con el segundo loop de reescritura (US-238 / L1D-300, FX-06b-a): adapters falsos sobre FX-06a-a.

Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import pytest

from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.reescritura import (
    Q_SIN_RESPUESTA,
    Q_TYPO,
    crear_entorno_de_reescritura,
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
