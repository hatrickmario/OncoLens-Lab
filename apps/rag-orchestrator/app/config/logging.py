"""Configuración de logging: JSON con `traceId`, y lo que ningún log debe registrar (RN-10, NFR-10, NFR-11)."""

import json
import logging
import sys
from collections.abc import Callable
from datetime import UTC, datetime

# Lista cerrada de lo que una línea puede llevar además de nivel, logger y mensaje. Todo lo demás que alguien pase en
# `extra=` (cuerpos, preguntas, identidad) se descarta aquí, sin depender de que cada llamada se acuerde de no pasarlo.
CAMPOS_DE_EVENTO = ("event", "variable", "regla", "motivo")
_MARCA_DEL_HANDLER = "_oncolens_json"

TraceIdActual = Callable[[], str | None]


def silenciar_urls_de_httpx_en_logs() -> None:
    # httpx y httpcore registran la URL de cada petición; la del LLM no debe llegar a los logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def _campos_del_evento(record: logging.LogRecord) -> dict[str, object]:
    """Solo los campos de la lista cerrada que el registro trae con valor."""
    campos = {campo: getattr(record, campo, None) for campo in CAMPOS_DE_EVENTO}
    return {campo: valor for campo, valor in campos.items() if valor is not None}


class FormateadorJson(logging.Formatter):
    """Una línea JSON por registro. Nunca vuelca el *traceback*: puede arrastrar el texto de la petición (RN-10)."""

    def __init__(self, trace_id_actual: TraceIdActual) -> None:
        super().__init__()
        self._trace_id_actual = trace_id_actual

    def format(self, record: logging.LogRecord) -> str:
        linea: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        trace_id = self._trace_id_actual()
        if trace_id is not None:
            linea["traceId"] = trace_id
        linea.update(_campos_del_evento(record))
        if record.exc_info and record.exc_info[0] is not None:
            linea["errorClase"] = record.exc_info[0].__name__
        return json.dumps(linea, ensure_ascii=False)


class _HandlerAStdout(logging.StreamHandler):
    """Escribe en el ``sys.stdout`` vigente en cada registro (no el de la creación): sigue a quien lo sustituya."""

    def __init__(self) -> None:
        super().__init__(sys.stdout)

    @property  # type: ignore[override]
    def stream(self):
        return sys.stdout

    @stream.setter
    def stream(self, _valor) -> None:
        pass


def configurar_logging_json(
    trace_id_actual: TraceIdActual, nivel: int = logging.INFO
) -> logging.Handler:
    """Instala en el root un único handler JSON hacia stdout (idempotente) y lo devuelve.

    ``trace_id_actual`` se inyecta (lo aporta `app.api.trace`): la configuración no depende de la capa de API.
    """
    raiz = logging.getLogger()
    for previo in [h for h in raiz.handlers if getattr(h, _MARCA_DEL_HANDLER, False)]:
        raiz.removeHandler(previo)
    handler = _HandlerAStdout()
    handler.setFormatter(FormateadorJson(trace_id_actual))
    setattr(handler, _MARCA_DEL_HANDLER, True)
    raiz.addHandler(handler)
    raiz.setLevel(nivel)
    return handler
