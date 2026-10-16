import pytest

from tests.support import contract


@pytest.fixture(scope="session", autouse=True)
def spec_empaquetado() -> dict:
    """Spec de rag-orchestrator empaquetado una vez por sesión para `assert_matches_spec`."""
    spec = contract.empaquetar_spec()
    contract.usar_spec(spec)
    return spec
