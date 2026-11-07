"""`POST /chat/turn` con el segundo loop contextual (US-271 / L1D-329, ADR-52): RN-19, RN-10, RN-11, RN-24.

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción, con el léxico y el catálogo de términos reales;
el LLM del chat, el generador de opciones, el NLI, el reranker, Milvus y las posiciones de los chunks son falsos con
contadores. Cada respuesta se valida contra el spec del proveedor (US-214). Solo datos sintéticos.
"""

import json

import pytest

from tests.support.arnes_contextual import (
    CON_REESCRITURA_DE_PRUEBA,
    CONSULTA_CONTEXTUAL,
    parametros_contextuales,
    Q_GENERICA,
    crear_entorno_contextual,
    puntajes_contextuales,
    solicitud_contextual,
)
from tests.support.chat import solicitud_desde_ejemplo
from tests.support.chat_evidencia import (
    ANALISIS_ACTIVO,
    PUNTAJES_DEL_SEGUIMIENTO,
    crear_entorno_de_chat_con_evidencia,
    solicitud_de_evidencia,
)
from tests.support.fakes import settings_de_prueba
from tests.support.llm_chat_evidencia_falso import FakeChatLlmEvidencia
from tests.support.recuperacion import EJEMPLOS, Q_HER2
from tests.support.reescritura import ReescritorFalso

PREFIJO_DEL_AVISO = "La búsqueda se amplió con datos del caso"
AVISOS_RN19 = [settings_de_prueba().chat_notice_ai, settings_de_prueba().chat_notice_academic]
Q_SEGUIMIENTO_GENERICO = "¿Y qué más dice?"


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _chat(**bordes):
    base = crear_entorno_contextual(**bordes)
    return base, crear_entorno_de_chat_con_evidencia(base)


@pytest.mark.ac("US-271", 1)
def test_chat_turn_recupera_evidencia_y_declara_la_ampliacion_cuando_una_pregunta_generica_dispara_el_loop_contextual():
    reescritor = ReescritorFalso()
    base, chat = _chat(
        parametros=parametros_contextuales(reescritura=CON_REESCRITURA_DE_PRUEBA),
        reescritor=reescritor,
    )

    respuesta = chat.turno(solicitud_desde_ejemplo("chat-turn-request-evidencia-contextual.json"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    (bloque,) = [b for b in cuerpo["blocks"] if b["kind"] == "evidencia"]
    recuperados = {c for lote in base.reranker.candidatos_recibidos for c in lote}
    assert bloque["citations"] and {c["chunkId"] for c in bloque["citations"]} <= recuperados
    assert cuerpo["notices"] == [*AVISOS_RN19, f"{PREFIJO_DEL_AVISO}: tipo, estadio y biomarcador"]
    assert base.reranker.preguntas == [Q_GENERICA, CONSULTA_CONTEXTUAL]
    assert reescritor.invocaciones == 0
    assert cuerpo == _ejemplo("chat-turn-evidencia-contextual.json")


@pytest.mark.ac("US-271", 4)
def test_chat_turn_no_declara_la_ampliacion_cuando_el_primer_loop_supera_el_umbral():
    base, chat = _chat()

    respuesta = chat.turno(solicitud_de_evidencia(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert not any(n.startswith(PREFIJO_DEL_AVISO) for n in cuerpo["notices"])
    assert cuerpo["notices"] == AVISOS_RN19
    assert "contextExpansion" not in cuerpo["evidenceAnalysis"]["meta"]["retrievalParams"]
    assert len(base.reranker.preguntas) == 1


@pytest.mark.ac("US-271", 6)
@pytest.mark.parametrize(
    ("biomarcadores", "campos"),
    [((), "tipo y estadio"), ((("HER2", "SENTINELA-VALOR-LIBRE"),), "tipo, estadio y biomarcador")],
    ids=["sin_biomarcador", "valor_libre_del_biomarcador"],
)
def test_chat_turn_nombra_campos_y_nunca_valores_en_el_aviso_cuando_corre_el_loop_contextual(
    biomarcadores, campos
):
    _, chat = _chat()
    solicitud_rag = solicitud_contextual(biomarcadores=biomarcadores)
    solicitud = solicitud_de_evidencia(
        Q_GENERICA, contexto_clinico=solicitud_rag["clinicalContext"]
    )

    respuesta = chat.turno(solicitud)

    assert respuesta.status_code == 200
    avisos = [n for n in respuesta.json()["notices"] if n.startswith(PREFIJO_DEL_AVISO)]
    assert avisos == [f"{PREFIJO_DEL_AVISO}: {campos}"]
    for valor in ("IIA", "3+", "SENTINELA", "HER2"):
        assert valor not in avisos[0]


@pytest.mark.ac("US-271", 5)
def test_chat_turn_no_amplia_la_busqueda_cuando_es_un_seguimiento_sin_tema_propio_y_el_primer_loop_esta_vacio():
    puntajes = {
        **puntajes_contextuales(),
        Q_SEGUIMIENTO_GENERICO: {"ch-m1-1": 0.05, "ch-inj-1": 0.05},
    }
    base = crear_entorno_contextual(puntajes=puntajes)
    chat = crear_entorno_de_chat_con_evidencia(base, llm=FakeChatLlmEvidencia("SEG-OK"))
    assert PUNTAJES_DEL_SEGUIMIENTO  # el arnés del seguimiento usa los mismos fragmentos del corpus
    chat.turno(solicitud_de_evidencia(Q_HER2))

    respuesta = chat.turno(
        solicitud_de_evidencia(
            Q_SEGUIMIENTO_GENERICO, rehidratacion=None, analisis_activo=ANALISIS_ACTIVO
        )
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "evidencia" and cuerpo["subintent"] == "seguimiento_evidencia"
    assert base.reranker.preguntas == [Q_HER2, Q_SEGUIMIENTO_GENERICO]  # sin segunda recuperación
    assert not any(n.startswith(PREFIJO_DEL_AVISO) for n in cuerpo["notices"])
    assert "evidenceAnalysis" not in cuerpo
    assert cuerpo["structuredState"]["ultimaEvidencia"]["topRelevanceScore"] is None
