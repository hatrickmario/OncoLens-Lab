"""`POST /chat/turn`, relevancia de un dato faltante (US-264 / L1D-321): RN-01, RN-02, RN-04, RN-23, RN-24, RN-29.

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción y el catálogo clínico montado es el real de
mama; el LLM del chat, el NLI, el reranker, Milvus y las posiciones de los chunks son falsos. Cada respuesta se valida
contra el spec del proveedor (US-214) y las peticiones son los ejemplos del contrato. Solo datos sintéticos.
"""

import json

import pytest

from app.config.settings import Settings
from app.application.ports import FalloDelLlm
from tests.support.chat import crear_entorno_de_chat, solicitud_desde_ejemplo
from tests.support.chat_relevancia import (
    CONSULTA_KI67,
    CONSULTA_MENOPAUSIA,
    Q_MENOPAUSIA,
    PUNTAJES_SIN_EVIDENCIA,
    con_estado_rehidratado,
    entorno_de_relevancia,
)
from tests.support.contract import CATALOGOS
from tests.support.llm_chat_falso import FakeChatLlm
from tests.unit.test_contexto_solo_con_el_tipo_de_cancer import (
    contexto_con_todos_los_campos_poblados,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import EJEMPLOS
from tests.support.reescritura import ReescritorFalso, parametros_de_reescritura

TEXTOS = Settings(_env_file=None)  # type: ignore[call-arg]
"""Los textos fijos de configuración (RN-22) con sus valores por defecto: el oráculo de lo que el nodo no genera."""
TEXTO_PRESCRIPTIVO = "El Ki-67 debe solicitarse antes de cualquier tratamiento."


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _criterio_del_catalogo(clave: str) -> dict:
    archivo = json.loads((CATALOGOS / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))
    return next(c for c in archivo["items"] if c["key"] == clave)


def _tipos(cuerpo: dict) -> list[str]:
    return [b["kind"] for b in cuerpo["blocks"]]


@pytest.mark.ac("US-264", 1)
def test_chat_turn_relevancia_devuelve_el_criterio_del_catalogo_y_la_cita_del_turno_cuando_se_pregunta_por_el_estado_menopausico():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "faltantes"
    assert _tipos(cuerpo) == ["catalogo", "evidencia"]
    criterio = _criterio_del_catalogo("estado_menopausico")
    assert criterio["label"]["es"] in cuerpo["blocks"][0]["text"]
    citas = cuerpo["blocks"][1]["citations"]
    assert [c["chunkId"] for c in citas] == ["ch-mp-1"]
    assert {c["chunkId"] for c in citas} <= entorno.chunks_recuperados()
    assert cuerpo["omittedClaims"] == 0
    assert cuerpo == _ejemplo("chat-turn-relevancia-ok.json")


@pytest.mark.ac("US-264", 1)
def test_chat_turn_relevancia_dice_con_el_texto_fijo_que_ningun_criterio_usa_el_dato_cuando_se_pregunta_por_el_ki_67():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-KI67")

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-criterio.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert _tipos(cuerpo) == ["catalogo", "evidencia"]
    assert TEXTOS.chat_relevancia_sin_criterio_texto in cuerpo["blocks"][0]["text"]
    assert "citations" not in cuerpo["blocks"][0]
    assert all(
        c["chunkId"] in entorno.chunks_recuperados() for c in cuerpo["blocks"][1]["citations"]
    )
    assert cuerpo == _ejemplo("chat-turn-relevancia-sin-criterio.json")


@pytest.mark.ac("US-264", 2)
def test_chat_turn_relevancia_omite_la_afirmacion_y_dice_que_la_evidencia_no_explica_cuando_el_nli_es_neutral():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK", nli=NliFalso(por_defecto=NEUTRAL))

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-soporte.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["omittedClaims"] == 1
    assert _tipos(cuerpo) == ["catalogo", "limitacion"]
    assert cuerpo["blocks"][1]["text"] == TEXTOS.chat_relevancia_sin_soporte_texto
    assert cuerpo == _ejemplo("chat-turn-relevancia-sin-soporte.json")


@pytest.mark.ac("US-264", 3)
def test_chat_turn_relevancia_responde_solo_el_catalogo_y_el_aviso_sin_llamar_al_llm_cuando_ningun_chunk_supera_el_umbral():
    reescritor = ReescritorFalso()
    entorno = entorno_de_relevancia(
        "CHAT-RELEVANCIA-OK",
        puntajes=PUNTAJES_SIN_EVIDENCIA,
        reescritor=reescritor,
        parametros=parametros_de_reescritura(),
    )

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-evidencia.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert entorno.llm.llamadas_de_generacion == 0 and entorno.llm.invocaciones == 0
    assert _tipos(cuerpo) == ["catalogo"]
    assert cuerpo["notices"][-1] == TEXTOS.chat_relevancia_sin_evidencia_aviso
    ultima = cuerpo["structuredState"]["ultimaEvidencia"]
    assert ultima["topRelevanceScore"] is None and ultima["topRelevanceScore"] != 0.0
    assert cuerpo == _ejemplo("chat-turn-relevancia-sin-evidencia.json")


@pytest.mark.ac("US-264", 4)
def test_chat_turn_relevancia_omite_la_afirmacion_prescriptiva_aunque_tenga_cita_y_entailment():
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-PRESCRIPTIVO", nli=nli)

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-criterio.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["omittedClaims"] == 1
    assert TEXTO_PRESCRIPTIVO not in respuesta.text and "debe solicitarse" not in respuesta.text
    assert _tipos(cuerpo) == ["catalogo", "limitacion"]


@pytest.mark.ac("US-264", 5)
def test_chat_turn_relevancia_dice_que_no_es_un_dato_critico_sin_bloque_catalogo_ni_llm_cuando_se_pregunta_por_el_ca_15_3():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-fuera-de-catalogo.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert _tipos(cuerpo) == ["limitacion"]
    assert cuerpo["blocks"][0]["text"] == TEXTOS.chat_relevancia_fuera_del_catalogo_texto
    assert entorno.llm.invocaciones == 0
    assert entorno.base.buscador.invocaciones == 0  # type: ignore[attr-defined]
    assert cuerpo == _ejemplo("chat-turn-relevancia-fuera-de-catalogo.json")


@pytest.mark.ac("US-264", 6)
def test_chat_turn_relevancia_omite_la_afirmacion_que_cita_un_chunk_de_un_turno_anterior():
    puntajes = {"ch-inj-1": 0.50}
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-TURNO-ANTERIOR", puntajes=puntajes)
    solicitud = con_estado_rehidratado(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-criterio.json"),
        citas_mostradas=["ch-mp-1"],
    )

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["omittedClaims"] == 1
    assert "ch-mp-1" not in {c["chunkId"] for b in cuerpo["blocks"] for c in b.get("citations", [])}
    assert _tipos(cuerpo) == ["catalogo", "limitacion"]
    assert CONSULTA_KI67 in entorno.base.reranker.preguntas  # type: ignore[attr-defined]


def test_chat_turn_relevancia_no_manda_datos_del_paciente_al_corpus_ni_al_llm_cuando_recupera_y_genera():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")

    entorno.turno(solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json"))

    consulta = CONSULTA_MENOPAUSIA
    assert entorno.base.reranker.preguntas == [consulta]  # type: ignore[attr-defined]
    assert entorno.base.embedder.textos == [consulta, "mama"]  # type: ignore[attr-defined]
    enviado = entorno.llm.sistemas[-1] + entorno.llm.usuarios[-1]  # type: ignore[operator]
    for dato_del_paciente in ("psd_", "carcinoma", "3+ (IHQ)", "Nottingham"):
        assert dato_del_paciente not in enviado
    assert (
        "<patient_data>" not in entorno.llm.usuarios[-1]
        and "<memory" not in entorno.llm.usuarios[-1]
    )
    assert entorno.llm.llamadas_de_clasificacion == 0 and entorno.llm.llamadas_de_generacion == 1


def test_chat_turn_relevancia_no_registra_la_pregunta_ni_el_texto_generado_cuando_responde(caplog):
    caplog.set_level("INFO")
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")

    entorno.turno(solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json"))

    eventos = [r.getMessage() for r in caplog.records if "chat_relevancia" in r.getMessage()]
    assert any("dato=estado_menopausico" in e and "omittedClaims=0" in e for e in eventos)
    assert Q_MENOPAUSIA not in caplog.text
    assert "estratifican a las pacientes" not in caplog.text


@pytest.mark.parametrize(
    ("escenario", "error", "codigo"),
    [
        ("CHAT-RELEVANCIA-OK", FalloDelLlm(), "LOCAL_LLM_UNAVAILABLE"),
        ("CHAT-RELEVANCIA-SALIDA-INVALIDA", None, "LLM_OUTPUT_INVALID"),
    ],
)
def test_chat_turn_relevancia_responde_503_sin_bloques_cuando_el_llm_falla_o_su_salida_no_cumple_el_esquema(
    escenario, error, codigo
):
    entorno = entorno_de_relevancia(llm=FakeChatLlm(escenario, error=error))

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json"))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == codigo
    assert "blocks" not in respuesta.json()


def test_chat_turn_relevancia_verbaliza_como_faltantes_sin_llm_cuando_no_hay_corpus_detras():
    entorno = crear_entorno_de_chat("CHAT-RELEVANCIA-OK")

    respuesta = entorno.turno(
        solicitud_desde_ejemplo("chat-turn-request-relevancia-sin-criterio.json")
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "faltantes"
    assert set(_tipos(cuerpo)) == {"faltante"}
    assert entorno.llm.invocaciones == 0


def test_chat_turn_relevancia_dice_que_nadie_usa_el_dato_y_nombra_el_criterio_agrupado_cuando_se_pregunta_por_el_re():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json")
    solicitud["question"] = "¿Por qué importa el receptor de estrógeno?"

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    texto = respuesta.json()["blocks"][0]["text"]
    assert "Receptor de estrógeno es un dato crítico del catálogo vigente" in texto
    assert _criterio_del_catalogo("receptores_hormonales")["label"]["es"] in texto


def test_chat_turn_relevancia_solo_embebe_y_puntua_la_consulta_del_catalogo_cuando_el_caso_trae_todos_los_campos_poblados():
    entorno = entorno_de_relevancia("CHAT-RELEVANCIA-OK")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-relevancia-ok.json")
    solicitud["clinicalContext"] = contexto_con_todos_los_campos_poblados().model_dump(mode="json")

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    assert entorno.base.embedder.textos == [CONSULTA_MENOPAUSIA, "mama"]  # type: ignore[attr-defined]
    assert entorno.base.reranker.preguntas == [CONSULTA_MENOPAUSIA]  # type: ignore[attr-defined]
    assert "SENTINELA" not in entorno.llm.usuarios[-1] + entorno.llm.sistemas[-1]  # type: ignore[operator]
