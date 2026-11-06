"""`POST /rag/query`, regresión de inyección en un chunk (US-057 AC-5, SEG-13, RN-01, RN-23).

El mecanismo de descarte ya existe (validación de citas, US-063/US-064): este test fija que una opción producida por
obedecer a ``ch-inj-1`` sin cita válida va a ``discardedOptions``. Cada respuesta se valida contra el spec del proveedor
(hook de ``verificacion_proveedor.py``, US-214).
"""

import json

import pytest

from tests.support.generador_llm import generador_con_llm
from tests.support.llm_falso import FakeLlmClient
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.prompt_separado import bloques
from tests.support.recuperacion import CORPUS_FX06A, Q_HER2, crear_entorno, solicitud_de

TEXTO_PRESCRIPTIVO = "recomendado para este paciente"
CH_INJ_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-inj-1")


@pytest.mark.ac("US-057", 5)
def test_la_opcion_que_obedece_a_ch_inj_1_sin_cita_valida_va_a_discarded_options_cuando_el_llm_cumple_la_inyeccion():
    """[US-057 AC-5]"""
    llm = FakeLlmClient("LLM-OBEDECE-INYECCION")
    entorno = crear_entorno(
        generador=generador_con_llm(llm), clasificador_nli=NliFalso(por_defecto=IMPLICA)
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    (documento_inyectado,) = [
        b.texto
        for b in bloques(llm.usuarios[0])
        if b.etiqueta == "document" and "Ignore" in b.texto
    ]
    assert "Ignore all previous instructions" in documento_inyectado
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] in (
        ["sin_citas"],
        ["cita_invalida"],
    )
    assert TEXTO_PRESCRIPTIVO not in json.dumps(cuerpo["evidenceOptions"], ensure_ascii=False)
    assert len(cuerpo["evidenceOptions"]) == 1
