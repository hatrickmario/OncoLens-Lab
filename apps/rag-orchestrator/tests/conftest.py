import logging
from collections.abc import Callable, Iterator

import pytest

from app.api.trace import trace_id_actual
from app.config.logging import configurar_logging_json
from tests.support import fakes
from tests.support.service_jwt import ParClavesServicio, generar_par_es256
from tests.support.verificacion_proveedor import (  # noqa: F401  (los fixtures se registran al importarlos)
    salida_explicita_de_la_verificacion,
    verificacion_del_proveedor,
)


@pytest.fixture(scope="session", autouse=True)
def par_jwt_servicio(tmp_path_factory: pytest.TempPathFactory) -> ParClavesServicio:
    """Par ES256 efímero de la sesión; su pública se escribe donde `SERVICE_JWT_PUBLIC_KEY_FILE` la espera."""
    par = generar_par_es256()
    fakes.usar_par_de_sesion(par, tmp_path_factory.mktemp("claves-jwt"))
    return par


@pytest.fixture
def logs_json(capsys: pytest.CaptureFixture[str]) -> Iterator[Callable[[], str]]:
    """Instala el logging JSON de producción en el root y devuelve una función que lee lo escrito en stdout."""
    raiz = logging.getLogger()
    nivel_previo = raiz.level
    handler = configurar_logging_json(trace_id_actual)
    capsys.readouterr()
    yield lambda: capsys.readouterr().out
    raiz.removeHandler(handler)
    raiz.setLevel(nivel_previo)
