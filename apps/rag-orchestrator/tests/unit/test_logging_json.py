"""Formateador JSON: una línea por registro, solo campos cerrados, sin *traceback* (RN-10, NFR-11)."""

import json
import logging
import sys

import contextvars

import pytest

from app.api.trace import fijar_trace_id, trace_id_actual
from app.config.logging import FormateadorJson, configurar_logging_json, registrar_evento


def _formatear(mensaje: str = "hola", *, trace_id: str | None = "req_abc12345", **extra) -> dict:
    registro = logging.LogRecord("app.prueba", logging.WARNING, __file__, 1, mensaje, (), None)
    for clave, valor in extra.items():
        setattr(registro, clave, valor)
    return json.loads(FormateadorJson(lambda: trace_id).format(registro))


def test_formateador_emite_nivel_logger_mensaje_y_trace_id_cuando_hay_trace_id():
    linea = _formatear("event=algo traceId=req_abc12345")

    assert linea["level"] == "warning"
    assert linea["logger"] == "app.prueba"
    assert linea["message"] == "event=algo traceId=req_abc12345"
    assert linea["traceId"] == "req_abc12345"


def test_formateador_omite_trace_id_cuando_no_hay_request_en_curso():
    assert "traceId" not in _formatear(trace_id=None)


def test_formateador_descarta_campos_ajenos_a_la_lista_cerrada_cuando_llegan_en_extra():
    linea = _formatear(
        body="SENTINELA-CUERPO", question="SENTINELA-PREGUNTA", nationalId="SENTINELA-NOMBRE"
    )

    assert "SENTINELA" not in json.dumps(linea)


def test_formateador_conserva_los_campos_del_evento_y_omite_los_nulos():
    linea = _formatear(event="configuracion_invalida", variable="RELEVANCE_THRESHOLD", motivo=None)

    assert linea["event"] == "configuracion_invalida"
    assert linea["variable"] == "RELEVANCE_THRESHOLD"
    assert "motivo" not in linea


def test_formateador_registra_solo_la_clase_de_la_excepcion_cuando_hay_exc_info():
    try:
        raise RuntimeError("SENTINELA-MENSAJE-DEL-ERROR")
    except RuntimeError:
        registro = logging.LogRecord(
            "app.prueba", logging.ERROR, __file__, 1, "fallo", (), sys.exc_info()
        )

    linea = json.loads(FormateadorJson(lambda: None).format(registro))

    assert linea["errorClase"] == "RuntimeError"
    assert "SENTINELA" not in json.dumps(linea)


@pytest.mark.ac("US-037", 4)
def test_registrar_evento_deja_el_trace_id_como_campo_y_no_dentro_del_message(capsys):
    def registrar() -> None:
        fijar_trace_id("req_abcdef12")
        registrar_evento(
            logging.getLogger("app.prueba"), logging.WARNING, "evento_de_prueba", motivo="m"
        )

    handler = configurar_logging_json(trace_id_actual)
    try:
        contextvars.copy_context().run(registrar)
    finally:
        logging.getLogger().removeHandler(handler)

    linea = json.loads(capsys.readouterr().out)
    assert linea["traceId"] == "req_abcdef12"
    assert "req_abcdef12" not in linea["message"]
    assert linea["event"] == "evento_de_prueba"
    assert linea["motivo"] == "m"
