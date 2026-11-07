"""`LLM_PROVIDER=fake` del chat (US-267 AC-1, US-034 AC-6): el ejemplo del contrato que corresponde a la pregunta.

El enrutado es el de reglas del motor real (``clasificar_por_reglas``); el análisis de evidencia es el MISMO que sirve
`/rag/query` para esa pregunta (``FakeEvidenceQuery``). Cada respuesta se valida contra el spec (hook US-214). Sin LLM.
"""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.chat import solicitud_de_turno, solicitud_desde_ejemplo
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import EJEMPLOS
from tests.support.service_jwt import con_token_valido


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _pregunta(nombre: str) -> str:
    return _ejemplo(nombre)["query"]


def _turno_falso(solicitud: dict):
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    cliente = TestClient(
        crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo()),
        headers=con_token_valido(par_de_sesion()),
    )
    return cliente.post("/chat/turn", json=solicitud)


@pytest.fixture
def llm_vigilado():
    with respx.mock(assert_all_called=False) as llm:
        llm.route().mock(return_value=httpx.Response(500))
        yield llm


@pytest.mark.ac("US-267", 1)
def test_chat_turn_fake_sirve_caso_faltantes_y_evidencia_segun_la_pregunta_cuando_llega_cada_una(
    llm_vigilado,
):
    preguntas = {
        "caso": "¿Cuál es la situación actual de la paciente?",
        "faltantes": "¿Qué información falta?",
        "evidencia": _pregunta("rag-query-request.json"),
    }

    obtenidas = {
        intencion: _turno_falso(solicitud_de_turno(pregunta)).json()
        for intencion, pregunta in preguntas.items()
    }

    assert {k: v["intent"] for k, v in obtenidas.items()} == {k: k for k in preguntas}
    assert "evidenceAnalysis" not in obtenidas["caso"]
    assert "evidenceAnalysis" not in obtenidas["faltantes"]
    assert obtenidas["evidencia"]["evidenceAnalysis"] == _ejemplo("rag-query-con-evidencia.json")
    assert not llm_vigilado.calls


@pytest.mark.parametrize(
    ("peticion", "respuesta"),
    [
        ("chat-turn-request.json", "chat-turn-caso-ok.json"),
        ("chat-turn-request-faltantes.json", "chat-turn-faltantes.json"),
        ("chat-turn-request-evidencia.json", "chat-turn-evidencia.json"),
        ("chat-turn-request-evidencia-contextual.json", "chat-turn-evidencia-contextual.json"),
        ("chat-turn-request-fuentes.json", "chat-turn-fuentes-ok.json"),
        ("chat-turn-request-no-clasificada.json", "chat-turn-no-clasificada.json"),
        ("chat-turn-request-fuera-de-alcance.json", "chat-turn-fuera-de-alcance.json"),
    ],
)
def test_chat_turn_fake_sirve_el_ejemplo_emparejado_cuando_recibe_su_peticion_de_ejemplo(
    peticion, respuesta
):
    resultado = _turno_falso(solicitud_desde_ejemplo(peticion))

    assert resultado.status_code == 200
    assert resultado.json() == _ejemplo(respuesta)


@pytest.mark.parametrize(
    ("peticion", "analisis"),
    [
        # «fuentes» en la pregunta: las reglas la mandarían a fuentes_limitaciones.
        ("rag-query-request-tres-opciones.json", "rag-query-tres-opciones.json"),
        # «faltante» en la pregunta: las reglas la mandarían a faltantes.
        ("rag-query-request-fx-t3-a.json", "rag-query-fx-t3-a.json"),
        (
            "rag-query-request-demo-s5-j-metastasica-1l.json",
            "rag-query-demo-s5-j-metastasica-1l.json",
        ),
        (
            "rag-query-request-demo-s4-mama-her2-adyuvante.json",
            "rag-query-demo-s4-mama-her2-adyuvante.json",
        ),
        ("rag-query-request-aplicabilidad-a-m1.json", "rag-query-aplicabilidad-a-m1.json"),
    ],
)
def test_chat_turn_fake_muestra_el_mismo_analisis_que_rag_query_cuando_la_pregunta_es_de_fixture(
    peticion, analisis
):
    resultado = _turno_falso(solicitud_de_turno(_pregunta(peticion))).json()

    assert resultado["intent"] == "evidencia"
    assert resultado["evidenceAnalysis"] == _ejemplo(analisis)


def test_chat_turn_fake_sirve_sin_evidencia_con_score_nulo_cuando_la_pregunta_es_la_de_sin_evidencia():
    resultado = _turno_falso(
        solicitud_de_turno(_pregunta("rag-query-request-sin-evidencia.json"))
    ).json()

    analisis = resultado["evidenceAnalysis"]
    assert analisis["status"] == "sin_evidencia" and analisis["topRelevanceScore"] is None
    assert {b["kind"] for b in resultado["blocks"]} == {"limitacion"}
    assert all("citations" not in b for b in resultado["blocks"])
    assert resultado["structuredState"]["ultimaEvidencia"]["topRelevanceScore"] is None
    assert resultado["structuredState"]["opcionesMostradas"] == []


def test_chat_turn_fake_sirve_sin_evidencia_cuando_la_pregunta_de_evidencia_no_es_de_fixture():
    resultado = _turno_falso(
        solicitud_de_turno("¿Qué describe la evidencia sobre un tema inventado?")
    ).json()

    assert resultado["intent"] == "evidencia"
    assert resultado["evidenceAnalysis"]["status"] == "sin_evidencia"
    assert resultado["evidenceAnalysis"]["topRelevanceScore"] is None
