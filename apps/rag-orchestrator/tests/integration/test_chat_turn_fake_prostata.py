"""`LLM_PROVIDER=fake` del chat por tipo de cáncer y por dato de relevancia (US-269 AC-1, D6-34): el ejemplo del contrato.

El E2E de AC01…AC06 corre contra este modo con el paciente (a) de mama y el (b) de próstata: el modo falso sirve la variante
de próstata (``chat-turn-*-prostata.json``) cuando el contexto del turno es de próstata y el ejemplo de relevancia del dato que
nombra la pregunta («¿Por qué importa el Ki-67?»). Sin LLM; cada respuesta se valida contra el spec (hook US-214).
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.chat import solicitud_desde_ejemplo
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import EJEMPLOS
from tests.support.service_jwt import con_token_valido


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _turno_falso(base: str, pregunta: str) -> dict:
    solicitud = solicitud_desde_ejemplo(base)
    solicitud["question"] = pregunta
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    cliente = TestClient(
        crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo()),
        headers=con_token_valido(par_de_sesion()),
    )
    respuesta = cliente.post("/chat/turn", json=solicitud)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


@pytest.mark.ac("US-269", 1)
@pytest.mark.parametrize(
    ("pregunta", "ejemplo"),
    [
        (
            "¿Cuál es la situación actual del paciente y cómo ha evolucionado el PSA?",
            "chat-turn-caso-situacion-prostata.json",
        ),
        ("¿Qué información falta del caso?", "chat-turn-faltantes-prostata.json"),
        ("¿Cuáles son las fuentes y las limitaciones?", "chat-turn-fuentes-prostata.json"),
    ],
)
def test_chat_turn_fake_sirve_la_variante_de_prostata_cuando_el_contexto_del_turno_es_de_prostata(
    pregunta, ejemplo
):
    cuerpo = _turno_falso("chat-turn-request-caso-adt.json", pregunta)

    assert cuerpo == _ejemplo(ejemplo)


@pytest.mark.ac("US-269", 1)
def test_chat_turn_fake_sirve_la_evidencia_de_prostata_con_su_analisis_cuando_la_pregunta_es_la_de_la_demo():
    pregunta = _ejemplo("chat-turn-request-evidencia-prostata.json")["question"]

    cuerpo = _turno_falso("chat-turn-request-caso-adt.json", pregunta)

    assert cuerpo["intent"] == "evidencia"
    assert [o["option"] for o in cuerpo["evidenceAnalysis"]["evidenceOptions"]] == [
        "Intensificación de la deprivación androgénica con darolutamida"
    ]
    assert cuerpo["blocks"] == _ejemplo("chat-turn-evidencia-prostata.json")["blocks"]


@pytest.mark.parametrize(
    ("base", "pregunta", "ejemplo"),
    [
        ("chat-turn-request.json", "¿Por qué importa el Ki-67?", "chat-turn-relevancia-sin-criterio.json"),
        ("chat-turn-request.json", "¿Por qué importa el estado menopáusico?", "chat-turn-relevancia-ok.json"),
        ("chat-turn-request.json", "¿Por qué importa el CA 15-3?", "chat-turn-relevancia-fuera-de-catalogo.json"),
        (
            "chat-turn-request-caso-adt.json",
            "¿Por qué importa conocer los genes HRR / BRCA?",
            "chat-turn-relevancia-prostata.json",
        ),
    ],
)
def test_chat_turn_fake_sirve_el_ejemplo_de_relevancia_del_dato_cuando_la_pregunta_es_de_por_que_importa(
    base, pregunta, ejemplo
):
    cuerpo = _turno_falso(base, pregunta)

    assert cuerpo == _ejemplo(ejemplo)


def test_chat_turn_fake_sirve_la_variante_de_mama_cuando_el_contexto_no_es_de_prostata():
    cuerpo = _turno_falso("chat-turn-request.json", "¿Qué información falta?")

    assert cuerpo == _ejemplo("chat-turn-faltantes.json")
