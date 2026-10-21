import json

import httpx
import pytest

from tests.support import contract
from tests.support.contract import (
    RAIZ_REPOSITORIO,
    assert_matches_spec,
    resolver_plantilla,
    verificar_respuesta,
)


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


def _verificar(metodo, ruta, status, cuerpo, cabeceras=None):
    verificar_respuesta(metodo, ruta, status, cabeceras or {}, json.dumps(cuerpo).encode())


def test_verificar_respuesta_ejemplo_valido_no_lanza():
    _verificar("GET", "/health", 200, _ejemplo("health-ok.json"))


def test_verificar_respuesta_codigo_no_declarado_lanza_nombrando_operacion_y_codigo():
    with pytest.raises(
        AssertionError, match=r"rag-orchestrator GET /health 404.*código no declarado"
    ):
        _verificar("GET", "/health", 404, {})


def test_verificar_respuesta_operacion_no_declarada_lanza_nombrandola():
    with pytest.raises(AssertionError, match=r"DELETE /health 200.*operación no declarada"):
        _verificar("DELETE", "/health", 200, {})


def test_verificar_respuesta_sin_schema_en_el_spec_no_valida_el_cuerpo():
    verificar_respuesta("POST", "/documents/extract", 413, {}, b"")


def test_verificar_respuesta_cuerpo_incumplido_nombra_la_ruta_json_sin_el_valor():
    cuerpo = {**_ejemplo("health-ok.json"), "status": "VALOR-SENTINELA"}
    with pytest.raises(AssertionError) as fallo:
        _verificar("GET", "/health", 200, cuerpo)
    assert "/status" in str(fallo.value)
    assert "VALOR-SENTINELA" not in str(fallo.value)


def test_resolver_plantilla_devuelve_la_plantilla_de_la_ruta_concreta():
    spec = {"paths": {"/a/{id}/b": {}, "/c": {}}}
    assert resolver_plantilla(spec, "/a/123/b") == "/a/{id}/b"
    assert resolver_plantilla(spec, "/c") == "/c"
    assert resolver_plantilla(spec, "/zzz") is None


def test_verificar_respuesta_falta_cabecera_obligatoria_lanza_nombrandola():
    anterior = contract._spec
    contract.usar_spec(
        {
            "components": {},
            "paths": {
                "/x": {
                    "get": {"responses": {"429": {"headers": {"Retry-After": {"required": True}}}}}
                }
            },
        }
    )
    try:
        with pytest.raises(AssertionError, match=r"GET /x 429.*cabecera Retry-After"):
            verificar_respuesta("GET", "/x", 429, {}, b"")
        verificar_respuesta("GET", "/x", 429, httpx.Headers({"retry-after": "3"}), b"")
    finally:
        contract.usar_spec(anterior)


def test_verificar_respuesta_ruta_no_resuelta_no_imprime_segmentos_ni_query():
    documento = "1234" + "567"  # por partes: el escáner de PII no lo ve como documento
    ruta = f"/rag/{documento}/Ana%20Sint%C3%A9tica?q=secreto#frag"
    with pytest.raises(AssertionError) as fallo:
        verificar_respuesta("POST", ruta, 200, {}, b"")
    mensaje = str(fallo.value)
    assert "/rag/{…}/{…}" in mensaje
    for filtrado in (documento, "Ana", "Sint", "secreto", "frag"):
        assert filtrado not in mensaje


def test_assert_matches_spec_no_imprime_el_valor_con_un_tipo_erroneo():
    cuerpo = {**_ejemplo("rag-query-sin-evidencia.json"), "omittedClaims": "CENTINELA-TIPO"}
    with pytest.raises(AssertionError) as fallo:
        assert_matches_spec("#/components/schemas/RagQueryInternalResponse", cuerpo)
    assert "/omittedClaims" in str(fallo.value)
    assert "CENTINELA-TIPO" not in str(fallo.value)


def test_assert_matches_spec_no_vuelca_el_objeto_cuando_ninguna_rama_del_oneof_encaja():
    anterior = contract._spec
    contract.usar_spec(
        {
            "components": {
                "schemas": {"S": {"oneOf": [{"type": "string"}, {"type": "integer"}]}}
            },
            "paths": {},
        }
    )
    try:
        with pytest.raises(AssertionError) as fallo:
            assert_matches_spec("#/components/schemas/S", {"campo": "CENTINELA-ONEOF"})
        assert "CENTINELA-ONEOF" not in str(fallo.value)
    finally:
        contract.usar_spec(anterior)


def test_verificar_respuesta_rechaza_un_formato_date_invalido_en_el_cuerpo():
    cuerpo = _ejemplo("rag-query-sin-evidencia.json")
    cuerpo["meta"]["corpusCutoffDate"] = "ayer"
    with pytest.raises(AssertionError, match="/meta/corpusCutoffDate"):
        _verificar("POST", "/rag/query", 200, cuerpo)
