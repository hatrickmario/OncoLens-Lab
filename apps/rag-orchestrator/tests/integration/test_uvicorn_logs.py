"""uvicorn real no escribe fuera del formateador JSON ni deja la query en ningún log (Gate 2 de L1D-167, privacy Mayor 2)."""

import json
import logging
import logging.config
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
import uvicorn.config

from app.api.trace import trace_id_actual
from app.config.logging import configurar_logging_json
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import par_de_sesion
from tests.support.logs import exigir_sin_valores_prohibidos, parsear_lineas_json
from tests.support.service_jwt import escribir_clave_publica

RAIZ_SERVICIO = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator"
DOCUMENTO = "1234567"
LOGGERS_DE_UVICORN = ("uvicorn", "uvicorn.error", "uvicorn.access")


def _cmd_del_dockerfile() -> list[str]:
    lineas = (RAIZ_SERVICIO / "Dockerfile").read_text(encoding="utf-8").splitlines()
    cmd = [linea for linea in lineas if linea.startswith('CMD ["uvicorn')]
    assert len(cmd) == 1, "el Dockerfile debe tener un único CMD de uvicorn"
    return json.loads(cmd[0].removeprefix("CMD "))


def test_el_cmd_de_uvicorn_del_dockerfile_desactiva_el_access_log():
    assert "--no-access-log" in _cmd_del_dockerfile()


def test_los_loggers_de_uvicorn_quedan_sin_handler_propio_y_propagando_al_root_tras_configurar():
    logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)
    assert logging.getLogger("uvicorn.access").handlers, (
        "la sonda necesita el estado inicial de uvicorn"
    )
    handler = configurar_logging_json(trace_id_actual)
    try:
        for nombre in LOGGERS_DE_UVICORN:
            logger = logging.getLogger(nombre)
            assert logger.handlers == [], nombre
            assert logger.propagate is True, nombre
    finally:
        logging.getLogger().removeHandler(handler)


def _puerto_libre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _correr_uvicorn_y_pedir_con_query(cmd: list[str], tmp_path: Path) -> tuple[str, str]:
    puerto = _puerto_libre()
    argumentos = [
        {"0.0.0.0": "127.0.0.1", "8000": str(puerto)}.get(a, a) for a in cmd if a != "uvicorn"
    ]
    entorno = {
        "PATH": "/usr/bin:/bin",
        "LLM_PROVIDER": "fake",
        "MODEL_PROVIDER": "fake",
        "FAKE_RESPONSES_PATH": str(RAIZ_REPOSITORIO / "contracts" / "examples"),
        "SERVICE_JWT_PUBLIC_KEY_FILE": str(escribir_clave_publica(par_de_sesion(), tmp_path)),
    }
    proceso = subprocess.Popen(  # noqa: S603
        [sys.executable, "-m", "uvicorn", *argumentos],
        cwd=RAIZ_SERVICIO,
        env=entorno,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        _esperar_health(puerto, proceso)
        urllib.request.urlopen(  # noqa: S310
            f"http://127.0.0.1:{puerto}/health?documento={DOCUMENTO}", timeout=10
        ).read()
    finally:
        proceso.terminate()
    salida, errores = proceso.communicate(timeout=30)
    return salida, errores


def _esperar_health(puerto: int, proceso: subprocess.Popen) -> None:
    limite = time.monotonic() + 60
    while time.monotonic() < limite:
        assert proceso.poll() is None, "uvicorn terminó antes de quedar listo"
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{puerto}/health", timeout=2).read()  # noqa: S310
            return
        except OSError:
            time.sleep(0.2)
    raise AssertionError("uvicorn no quedó listo en 60 s")


def test_uvicorn_real_no_deja_la_query_en_ninguna_linea_y_todo_sale_en_json(tmp_path):
    salida, errores = _correr_uvicorn_y_pedir_con_query(_cmd_del_dockerfile(), tmp_path)

    assert parsear_lineas_json(salida), "uvicorn debe dejar al menos una línea JSON"
    exigir_sin_valores_prohibidos(salida + errores, [DOCUMENTO])


def test_la_sonda_ve_la_query_cuando_uvicorn_corre_sin_no_access_log(tmp_path):
    # Mutación: sin el flag el access log pasa por el formateador y la query aparece; si no apareciera, la prueba
    # real de arriba no estaría observando el canal correcto.
    cmd = [a for a in _cmd_del_dockerfile() if a != "--no-access-log"]

    salida, errores = _correr_uvicorn_y_pedir_con_query(cmd, tmp_path)

    with pytest.raises(AssertionError, match=DOCUMENTO):
        exigir_sin_valores_prohibidos(salida + errores, [DOCUMENTO])
