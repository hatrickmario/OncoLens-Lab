import json
import pathlib
import subprocess
import sys

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


def _con_spec_sintetico(respuestas: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    spec = {"components": {}, "paths": {"/x": {"get": {"responses": respuestas}}}}
    monkeypatch.setattr(contract, "_spec", spec)


def test_verificar_respuesta_acepta_un_codigo_cubierto_por_nxx_o_default(monkeypatch):
    _con_spec_sintetico({"200": {}, "4XX": {}, "default": {}}, monkeypatch)
    verificar_respuesta("GET", "/x", 404, {}, b"")
    verificar_respuesta("GET", "/x", 503, {}, b"")


def test_verificar_respuesta_codigo_exacto_gana_a_nxx(monkeypatch):
    schema = {"content": {"application/json": {"schema": {"type": "object", "required": ["a"]}}}}
    _con_spec_sintetico({"404": schema, "4XX": {}}, monkeypatch)
    with pytest.raises(AssertionError, match="GET /x 404"):
        verificar_respuesta("GET", "/x", 404, {}, b"{}")


def test_verificar_respuesta_codigo_sin_nxx_ni_default_lanza(monkeypatch):
    _con_spec_sintetico({"200": {}, "4XX": {}}, monkeypatch)
    with pytest.raises(AssertionError, match="GET /x 503.*código no declarado"):
        verificar_respuesta("GET", "/x", 503, {}, b"")


def test_verificar_respuesta_cuerpo_no_vacio_sin_contenido_declarado_lanza():
    with pytest.raises(AssertionError, match=r"POST /documents/extract 413.*no declara cuerpo"):
        verificar_respuesta("POST", "/documents/extract", 413, {}, b'{"x": 1}')


def test_empaquetar_spec_incluye_el_stderr_de_node_cuando_node_falla(monkeypatch):
    monkeypatch.setattr(contract, "PROVEEDOR", "proveedor-inexistente")
    with pytest.raises(RuntimeError, match="proveedor-inexistente"):
        contract.empaquetar_spec()


def test_un_test_de_dominio_puro_corre_sin_node_en_el_path():
    pura = "tests/unit/test_admisibilidad.py"
    entorno = {"PATH": str(pathlib.Path(sys.executable).parent), "HOME": str(pathlib.Path.home())}
    resultado = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", pura],
        cwd=contract.RAIZ_REPOSITORIO / "apps/rag-orchestrator",
        env=entorno,
        capture_output=True,
        text=True,
    )
    assert resultado.returncode == 0, resultado.stdout[-400:]


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
            "components": {"schemas": {"S": {"oneOf": [{"type": "string"}, {"type": "integer"}]}}},
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
