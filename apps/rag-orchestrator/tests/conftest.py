import pytest

from tests.support import contract, fakes
from tests.support.service_jwt import ParClavesServicio, generar_par_es256


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
