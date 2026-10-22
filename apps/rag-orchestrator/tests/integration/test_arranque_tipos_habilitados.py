"""`ENABLED_CANCER_TYPES` al arrancar (US-043, RN-20, RN-22): validada contra el manifiesto, sin eco del valor."""

import pytest

from app.bootstrap import cargar_settings_o_salir
from tests.support.contract import CATALOGOS
from tests.support.logs import exigir_sin_valores_prohibidos, parsear_lineas_json

SENTINELA_DE_TIPO = "SENTINELA-TIPO-AJENO"


def _entorno(monkeypatch, *, proveedor: str, tipos: str | None) -> None:
    monkeypatch.setenv("LLM_PROVIDER", proveedor)
    monkeypatch.setenv("CLINICAL_CATALOG_PATH", str(CATALOGOS))
    if tipos is None:
        monkeypatch.delenv("ENABLED_CANCER_TYPES", raising=False)
    else:
        monkeypatch.setenv("ENABLED_CANCER_TYPES", tipos)


def test_arranque_registra_tipo_no_en_catalogo_sin_el_tipo_cuando_la_lista_trae_uno_ajeno(
    monkeypatch, logs_json
):
    _entorno(monkeypatch, proveedor="fake", tipos=f"mama,{SENTINELA_DE_TIPO}")

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    registrado = logs_json()
    evento = parsear_lineas_json(registrado)[0]
    assert salida.value.code == 1
    assert evento["event"] == "configuracion_invalida"
    assert evento["variable"] == "ENABLED_CANCER_TYPES"
    assert evento["motivo"] == "tipo_no_en_catalogo"
    exigir_sin_valores_prohibidos(registrado, [SENTINELA_DE_TIPO])


def test_arranque_registra_variable_ausente_cuando_el_proveedor_es_local_y_la_lista_esta_vacia(
    monkeypatch, logs_json
):
    _entorno(monkeypatch, proveedor="local", tipos=None)
    monkeypatch.setenv("RELEVANCE_THRESHOLD", "0.3")
    monkeypatch.setenv("RETRIEVAL_TOP_K", "40")
    monkeypatch.setenv("RERANK_TOP_N", "10")
    monkeypatch.setenv("NLI_ENTAILMENT_THRESHOLD", "0.7")

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    eventos = parsear_lineas_json(logs_json())
    assert salida.value.code == 1
    assert [e["variable"] for e in eventos] == ["ENABLED_CANCER_TYPES"]
    assert eventos[0]["motivo"] == "variable_ausente"


def test_arranque_carga_los_tipos_habilitados_cuando_todos_estan_en_el_manifiesto(monkeypatch):
    _entorno(monkeypatch, proveedor="fake", tipos="mama,prostata")

    assert cargar_settings_o_salir().enabled_cancer_types == ("mama", "prostata")
