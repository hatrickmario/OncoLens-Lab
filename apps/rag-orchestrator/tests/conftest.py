from typing import Any

import pytest

from tests.support import contract, fakes
from tests.support.service_jwt import ParClavesServicio, generar_par_es256
from tests.support.verificacion_proveedor import (  # noqa: F401  (los fixtures se registran al importarlos)
    respuestas_verificadas,
    salida_explicita_de_la_verificacion,
    verificacion_del_proveedor,
)


@pytest.fixture(scope="session", autouse=True)
def par_jwt_servicio(tmp_path_factory: pytest.TempPathFactory) -> ParClavesServicio:
    """Par ES256 efímero de la sesión; su pública se escribe donde `SERVICE_JWT_PUBLIC_KEY_FILE` la espera."""
    par = generar_par_es256()
    fakes.usar_par_de_sesion(par, tmp_path_factory.mktemp("claves-jwt"))
    return par


def pytest_terminal_summary(terminalreporter: Any) -> None:
    terminalreporter.write_line(
        f"verificación del proveedor: {respuestas_verificadas()} respuestas verificadas contra "
        f"{contract.PROVEEDOR}"
    )
