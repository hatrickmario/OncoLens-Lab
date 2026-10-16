import json

import pytest

from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec


def _ejemplo(nombre: str) -> dict:
    return json.loads(
        (RAIZ_REPOSITORIO / "contracts/examples" / nombre).read_text(encoding="utf-8")
    )


def test_assert_matches_spec_ejemplo_valido_no_lanza():
    assert_matches_spec("#/components/schemas/HealthStatus", _ejemplo("health-ok.json"))
    assert_matches_spec(
        "#/components/schemas/RagQueryInternalResponse", _ejemplo("rag-query-con-evidencia.json")
    )


def test_assert_matches_spec_respuesta_de_error_por_puntero_del_path():
    assert_matches_spec(
        "#/paths/~1health/get/responses/503", _ejemplo("rag-health-llm-no-disponible.json")
    )


def test_assert_matches_spec_campo_requerido_ausente_lanza_nombrandolo():
    incompleto = _ejemplo("rag-health-llm-no-disponible.json")
    del incompleto["error"]
    with pytest.raises(AssertionError, match="error"):
        assert_matches_spec("#/paths/~1health/get/responses/503", incompleto)


def test_assert_matches_spec_destino_inexistente_lanza_nombrandolo():
    with pytest.raises(AssertionError, match="NoExiste"):
        assert_matches_spec("#/components/schemas/NoExiste", {})
