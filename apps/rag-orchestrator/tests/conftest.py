from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.support import contract, fakes
from tests.support.service_jwt import ParClavesServicio, generar_par_es256

_respuestas_verificadas = 0


@pytest.fixture(scope="session", autouse=True)
def spec_empaquetado() -> dict:
    """Spec de rag-orchestrator empaquetado una vez por sesión para `assert_matches_spec`."""
    spec = contract.empaquetar_spec()
    contract.usar_spec(spec)
    return spec


@pytest.fixture(scope="session", autouse=True)
def par_jwt_servicio(tmp_path_factory: pytest.TempPathFactory) -> ParClavesServicio:
    """Par ES256 efímero de la sesión; su pública se escribe donde `SERVICE_JWT_PUBLIC_KEY_FILE` la espera."""
    par = generar_par_es256()
    fakes.usar_par_de_sesion(par, tmp_path_factory.mktemp("claves-jwt"))
    return par


def _verificar_respuesta_del_cliente(respuesta: httpx.Response) -> None:
    """Hook de respuesta del TestClient (US-214): toda respuesta se valida contra el spec del proveedor."""
    global _respuestas_verificadas
    respuesta.read()
    peticion = respuesta.request
    contract.verificar_respuesta(
        peticion.method,
        peticion.url.path,
        respuesta.status_code,
        respuesta.headers,
        respuesta.content,
    )
    _respuestas_verificadas += 1


@pytest.fixture(scope="session", autouse=True)
def verificacion_del_proveedor(spec_empaquetado: dict):
    """Instala el hook en cada `TestClient` creado durante la sesión, sin que el test lo pida."""
    constructor = TestClient.__init__

    def con_verificacion(self: TestClient, *args: Any, **kwargs: Any) -> None:
        constructor(self, *args, **kwargs)
        self.event_hooks["response"].append(_verificar_respuesta_del_cliente)

    TestClient.__init__ = con_verificacion  # type: ignore[method-assign]
    yield
    TestClient.__init__ = constructor  # type: ignore[method-assign]


def pytest_terminal_summary(terminalreporter: Any) -> None:
    terminalreporter.write_line(
        f"verificación del proveedor: {_respuestas_verificadas} respuestas verificadas contra "
        f"{contract.PROVEEDOR}"
    )
