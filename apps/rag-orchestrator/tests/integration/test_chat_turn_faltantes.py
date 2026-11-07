"""`POST /chat/turn` con la intención ``faltantes`` (US-263 / L1D-320): verbalización determinista, sin LLM.

El servicio del turno es el de producción; el LLM, el contador de tokens y el reloj son falsos y cuentan sus
invocaciones. El catálogo montado es el real 1.7.0 (``sourceDocumentTypes`` por dato crítico). Cada respuesta se valida
contra el spec del proveedor (US-214). Solo datos sintéticos.
"""

import copy
import json
import random

import pytest

from tests.support.chat import crear_entorno_de_chat
from tests.support.recuperacion import EJEMPLOS, VERSION_DEL_CATALOGO_MONTADO, CatalogoClinicoFalso


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _solicitud(
    nombre: str = "chat-turn-request-faltantes.json", *, hilo_vivo: bool = False
) -> dict:
    """El ejemplo del contrato con el catálogo que montan los tests; ``hilo_vivo`` quita la rehidratación (turno 2)."""
    solicitud = copy.deepcopy(_ejemplo(nombre))
    solicitud["catalogVersion"] = VERSION_DEL_CATALOGO_MONTADO
    if hilo_vivo:
        solicitud.pop("rehydration", None)
    return solicitud


BLOQUES_DEL_EJEMPLO = _ejemplo("chat-turn-faltantes.json")["blocks"]
"""La respuesta del contrato a la petición ``chat-turn-request-faltantes.json``: el oráculo de los bloques."""


def _textos(respuesta) -> list[str]:
    return [b["text"] for b in respuesta.json()["blocks"]]


@pytest.mark.ac("US-263", 4)
def test_chat_turn_faltantes_repite_los_mismos_bloques_sin_llamar_al_llm_cuando_se_pregunta_dos_veces():
    entorno = crear_entorno_de_chat("CHAT-OK")

    primera = entorno.turno(_solicitud())
    segunda = entorno.turno(_solicitud(hilo_vivo=True))

    assert primera.status_code == 200 and segunda.status_code == 200
    assert primera.json()["intent"] == segunda.json()["intent"] == "faltantes"
    assert primera.json()["blocks"] == segunda.json()["blocks"] == BLOQUES_DEL_EJEMPLO
    assert all(b["kind"] == "faltante" for b in primera.json()["blocks"])
    assert entorno.llm.invocaciones == 0
    assert entorno.nli.invocaciones == 0
    assert entorno.contador.consultas == 0
    # Deterministas y exentos de cita: ni citas ni factRefs, y el validador no los omite ni los cuenta (RN-01).
    assert all("citations" not in b and "factRefs" not in b for b in primera.json()["blocks"])
    assert primera.json()["omittedClaims"] == segunda.json()["omittedClaims"] == 0


def test_chat_turn_faltantes_sigue_el_orden_del_catalogo_cuando_la_peticion_los_trae_desordenados():
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = _solicitud()
    random.Random(7).shuffle(solicitud["completeness"])

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    assert _textos(respuesta) == [b["text"] for b in BLOQUES_DEL_EJEMPLO]


def test_chat_turn_faltantes_nombra_los_tipos_de_documento_del_catalogo_cuando_no_se_halla_el_dato():
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(_solicitud())

    por_etiqueta = dict(texto.split(": ", 1) for texto in _textos(respuesta))
    assert (
        "no se halló en los documentos procesados (historia clínica)"
        in por_etiqueta["Estado menopáusico"]
    )
    assert "ningún documento de tipo examen" in por_etiqueta["Ki-67"]
    assert not any("ausente en el paciente" in texto for texto in _textos(respuesta))


@pytest.mark.ac("US-263", 6)
def test_chat_turn_faltantes_dice_que_no_faltan_datos_y_nombra_la_version_cuando_ningun_item_tiene_gaptype():
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(_solicitud("chat-turn-request-faltantes-ninguno.json"))

    assert respuesta.status_code == 200
    bloques = respuesta.json()["blocks"]
    assert [b["kind"] for b in bloques] == ["limitacion"]
    assert "No faltan datos críticos según el catálogo" in bloques[0]["text"]
    assert VERSION_DEL_CATALOGO_MONTADO in bloques[0]["text"]
    assert "1.7.0" in bloques[0]["text"]
    assert bloques == _ejemplo("chat-turn-faltantes-ninguno.json")["blocks"]
    assert entorno.llm.invocaciones == 0


@pytest.mark.ac("US-263", 7)
def test_chat_turn_responde_409_sin_invocar_adaptadores_cuando_rag_monta_el_catalogo_1_5_0_y_el_turno_trae_1_6_0():
    entorno = crear_entorno_de_chat("CHAT-OK", catalogo=CatalogoClinicoFalso(version="1.5.0"))
    solicitud = _solicitud()
    solicitud["catalogVersion"] = "1.7.0"

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "CATALOG_VERSION_MISMATCH"
    assert entorno.llamadas_a_adapters() == {"llm": 0, "contador": 0}
    assert entorno.nli.invocaciones == 0


def test_chat_turn_faltantes_usa_la_etiqueta_del_catalogo_y_descarta_el_item_ajeno_cuando_la_peticion_trae_otra():
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = _solicitud()
    solicitud["completeness"] = [
        {**item, "label": "SINT-etiqueta-ajena"} for item in solicitud["completeness"]
    ] + [
        {
            "item": "dato_inventado",
            "label": "Dato inventado",
            "status": "faltante",
            "gapType": "no_buscado",
            "destination": "Biomarker.value",
        }
    ]

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    assert _textos(respuesta) == [b["text"] for b in BLOQUES_DEL_EJEMPLO]
    assert "SINT-etiqueta-ajena" not in respuesta.text and "inventado" not in respuesta.text
