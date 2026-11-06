"""Seguimiento y reescritura entregan instrucciones en `system` y datos en bloques (US-057, SEG-13, RN-24, RN-02)."""

import json

import pytest

from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from app.infrastructure.llm.reescritor_de_consulta import ReescritorDeConsultaLocal
from tests.support.prompt_separado import bloques
from tests.support.recuperacion import Q_HER2
from tests.support.seguimiento import (
    Q_SEGUIMIENTO,
    crear_entorno_de_seguimiento,
    solicitud_de_seguimiento,
)

pytestmark = pytest.mark.anyio


@pytest.mark.ac("US-057", 1)
def test_la_memoria_del_seguimiento_va_en_memory_citable_no_y_no_en_el_sistema_cuando_el_analisis_trae_memoria():
    """[US-057 AC-1] (asumido) [RN-24]"""
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    entorno.seguir(solicitud_de_seguimiento())

    assert entorno.llm.sistemas and entorno.llm.sistemas[0] is not None
    sistema, (usuario,) = entorno.llm.sistemas[0], entorno.llm.prompts
    encontrados = bloques(usuario)
    memoria = [b for b in encontrados if b.etiqueta == "memory"]
    assert len(memoria) >= 1 and all(b.atributos == 'citable="no"' for b in memoria)
    assert [b.etiqueta for b in encontrados].count("document") >= 1
    assert all(b.texto not in sistema for b in memoria)
    assert Q_SEGUIMIENTO not in sistema


class _LlmDeReescritura:
    def __init__(self) -> None:
        self.sistemas: list[str | None] = []
        self.prompts: list[str] = []

    async def completar_json_acotado(self, prompt, esquema, *, max_tokens, semilla, sistema=None):
        self.prompts.append(prompt)
        self.sistemas.append(sistema)
        return RespuestaDelLlm(json.dumps({"terminos": ["ribociclib"]}), "stop")


@pytest.mark.ac("US-057", 4)
async def test_la_reescritura_lleva_la_pregunta_en_question_y_no_en_el_sistema_cuando_se_activa_el_segundo_loop():
    """[US-057 AC-4] (asumido) [RN-02]"""
    llm = _LlmDeReescritura()

    await ReescritorDeConsultaLocal(llm, max_terminos=3, max_tokens_de_salida=64).reformular(Q_HER2)

    assert llm.sistemas and llm.sistemas[0] is not None
    assert Q_HER2 not in llm.sistemas[0]
    (pregunta,) = [b for b in bloques(llm.prompts[0]) if b.etiqueta == "question"]
    assert pregunta.texto == Q_HER2
