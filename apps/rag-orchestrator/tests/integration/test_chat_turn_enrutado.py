"""`POST /chat/turn` (US-259 / L1D-316): enrutado determinista antes que el LLM, `fuera_de_alcance`, `409` y `503`.

El servicio del turno es el de producción; el LLM, el contador de tokens y el reloj son falsos. Cada respuesta se valida
contra el spec del proveedor (US-214). Solo datos sintéticos.
"""

import json
import re

import pytest

from app.application.ports import FalloDelLlm
from app.domain.lenguaje import normalizar_texto
from tests.support.chat import (
    Q_CASO,
    Q_EVIDENCIA,
    Q_FALTANTES,
    Q_OTRA_PERSONA,
    Q_OTRO_CANCER,
    Q_PII_SIN_ENMASCARAR,
    Q_PRESCRIPTIVA,
    Q_SIN_REGLA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.recuperacion import EJEMPLOS


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _trigramas(texto: str) -> set[tuple[str, ...]]:
    palabras = normalizar_texto(texto).split()
    return {tuple(palabras[i : i + 3]) for i in range(len(palabras) - 2)}


@pytest.mark.ac("US-259", 2)
@pytest.mark.parametrize(
    ("pregunta", "intencion"),
    [(Q_CASO, "caso"), (Q_FALTANTES, "faltantes"), (Q_EVIDENCIA, "evidencia")],
)
def test_chat_turn_enruta_sin_llamar_al_llm_de_clasificacion_cuando_las_reglas_clasifican(
    pregunta, intencion
):
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(pregunta))

    assert respuesta.status_code == 200
    assert respuesta.json()["intent"] == intencion
    assert entorno.llm.llamadas_de_clasificacion == 0


@pytest.mark.ac("US-259", 3)
def test_chat_turn_usa_la_intencion_del_llm_con_una_llamada_de_clasificacion_cuando_ninguna_regla_clasifica():
    entorno = crear_entorno_de_chat("CHAT-RUTA")

    respuesta = entorno.turno(solicitud_de_turno(Q_SIN_REGLA))

    assert respuesta.status_code == 200
    assert respuesta.json()["intent"] == "faltantes"
    assert entorno.llm.llamadas_de_clasificacion == 1


@pytest.mark.ac("US-259", 3)
def test_chat_turn_devuelve_no_clasificada_sin_nodos_de_generacion_cuando_la_clasificacion_no_es_json():
    entorno = crear_entorno_de_chat("CHAT-RUTA-INVALIDA")

    respuesta = entorno.turno(solicitud_de_turno(Q_SIN_REGLA))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "no_clasificada"
    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert "reformularse" in cuerpo["blocks"][0]["text"].lower()
    assert cuerpo["notices"] == []
    assert entorno.llm.llamadas_de_clasificacion == 1
    assert entorno.llm.llamadas_de_generacion == 0


@pytest.mark.ac("US-259", 2)
@pytest.mark.parametrize("pregunta", [Q_OTRA_PERSONA, Q_OTRO_CANCER, Q_PII_SIN_ENMASCARAR])
def test_chat_turn_responde_fuera_de_alcance_sin_llamar_al_llm_cuando_nombra_a_otra_persona_otro_cancer_o_pii(
    pregunta,
):
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "fuera_de_alcance"
    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["notices"] == []
    assert entorno.llm.invocaciones == 0


@pytest.mark.parametrize("pregunta", [Q_OTRA_PERSONA, Q_OTRO_CANCER, Q_PII_SIN_ENMASCARAR])
def test_chat_turn_no_repite_parte_de_la_pregunta_en_el_texto_fuera_de_alcance_cuando_responde(
    pregunta,
):
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(pregunta))

    assert respuesta.status_code == 200
    texto = " ".join(b["text"] for b in respuesta.json()["blocks"])
    assert not (_trigramas(texto) & _trigramas(pregunta))
    assert not re.search(r"\[[A-Z]+\]", texto)


def test_chat_turn_enruta_a_evidencia_y_no_a_fuera_de_alcance_cuando_la_pregunta_es_prescriptiva():
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(Q_PRESCRIPTIVA))

    assert respuesta.status_code == 200
    assert respuesta.json()["intent"] == "evidencia"
    assert entorno.llm.llamadas_de_clasificacion == 0


def test_chat_turn_responde_401_sin_llamar_a_ningun_adapter_cuando_falta_el_jwt_de_servicio():
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = solicitud_de_turno(Q_CASO)

    respuesta = entorno.cliente.post("/chat/turn", json=solicitud, headers={"Authorization": ""})

    assert respuesta.status_code == 401
    assert respuesta.json()["error"] == "TOKEN_SERVICIO_INVALIDO"
    assert entorno.llamadas_a_adapters() == {"llm": 0, "contador": 0}


def test_chat_turn_responde_500_error_interno_sin_eco_cuando_un_adapter_falla_de_forma_inesperada():
    entorno = crear_entorno_de_chat(
        "CHAT-OK", llm=FakeChatLlm("CHAT-OK", error=RuntimeError("SENTINELA"))
    )

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 500
    assert respuesta.json()["error"] == "ERROR_INTERNO"
    assert "SENTINELA" not in respuesta.text and Q_CASO not in respuesta.text


def test_chat_turn_responde_503_local_llm_unavailable_sin_bloques_cuando_el_llm_falla_con_el_error_del_puerto():
    entorno = crear_entorno_de_chat("CHAT-OK", llm=FakeChatLlm("CHAT-OK", error=FalloDelLlm()))

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert "blocks" not in respuesta.json()


def test_chat_turn_responde_409_sin_llamar_a_ningun_adapter_cuando_catalog_version_difiere():
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(version_del_catalogo="1999.01.0"))

    assert respuesta.status_code == 409
    esperado = _ejemplo("rag-catalog-version-mismatch.json")
    assert {k: v for k, v in respuesta.json().items() if k != "traceId"} == {
        k: v for k, v in esperado.items() if k != "traceId"
    }
    assert entorno.llamadas_a_adapters() == {"llm": 0, "contador": 0}


def test_chat_turn_responde_503_llm_output_invalid_sin_bloques_cuando_la_salida_de_generacion_no_valida():
    entorno = crear_entorno_de_chat("CHAT-SALIDA-INVALIDA")

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 503
    esperado = _ejemplo("rag-salida-llm-invalida.json")
    cuerpo = respuesta.json()
    assert {k: v for k, v in cuerpo.items() if k != "traceId"} == {
        k: v for k, v in esperado.items() if k != "traceId"
    }
    assert "blocks" not in cuerpo
