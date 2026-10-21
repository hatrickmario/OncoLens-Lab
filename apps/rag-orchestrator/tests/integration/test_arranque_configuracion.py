"""Configuración inválida al arrancar: el servicio no queda listo y el log nombra la variable y la regla (US-037 AC-2)."""

import os
import subprocess
import sys

import pytest

from app.bootstrap import cargar_settings_o_salir
from tests.support.contract import CATALOGOS, RAIZ_REPOSITORIO
from tests.support.logs import (
    exigir_sin_valores_prohibidos,
    parsear_lineas_json,
)

RAIZ_SERVICIO = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator"
VALOR_FUERA_DE_RANGO = "1.7"
CLAVES_QUE_EL_TEST_FIJA = {
    "RELEVANCE_THRESHOLD",
    "RETRIEVAL_TOP_K",
    "LLM_PROVIDER",
    "MODEL_PROVIDER",
    "REAL_ANONYMIZED_ENABLED",
    "REAL_IDENTIFIED_ENABLED",
}


def _entorno_del_proceso(**variables: str) -> dict[str, str]:
    base = {k: v for k, v in os.environ.items() if k.upper() not in CLAVES_QUE_EL_TEST_FIJA}
    return {**base, **variables}


@pytest.mark.ac("US-037", 2)
def test_arranque_umbral_fuera_de_rango_no_queda_listo():
    resultado = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        check=False,
        cwd=RAIZ_SERVICIO,
        env=_entorno_del_proceso(RELEVANCE_THRESHOLD=VALOR_FUERA_DE_RANGO),
        capture_output=True,
        text=True,
        timeout=120,
    )

    lineas = parsear_lineas_json(resultado.stdout)
    assert resultado.returncode == 1
    eventos = [linea for linea in lineas if linea.get("event") == "configuracion_invalida"]
    assert len(eventos) == 1
    assert eventos[0]["variable"] == "RELEVANCE_THRESHOLD"
    assert eventos[0]["motivo"] == "valor_invalido"
    assert eventos[0]["regla"]
    assert "valorInvalido" not in eventos[0]
    exigir_sin_valores_prohibidos(resultado.stdout + resultado.stderr, [VALOR_FUERA_DE_RANGO])


def test_arranque_sale_con_codigo_1_y_un_evento_por_variable_cuando_hay_varias_invalidas(
    monkeypatch, logs_json
):
    monkeypatch.setenv("RELEVANCE_THRESHOLD", VALOR_FUERA_DE_RANGO)
    monkeypatch.setenv("RETRIEVAL_TOP_K", "SENTINELA-NO-NUMERICO")

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    registrado = logs_json()
    eventos = parsear_lineas_json(registrado)
    assert salida.value.code == 1
    assert sorted(e["variable"] for e in eventos) == ["RELEVANCE_THRESHOLD", "RETRIEVAL_TOP_K"]
    assert {e["event"] for e in eventos} == {"configuracion_invalida"}
    exigir_sin_valores_prohibidos(registrado, [VALOR_FUERA_DE_RANGO, "SENTINELA-NO-NUMERICO"])


def test_arranque_omite_la_variable_cuando_la_regla_cruza_varias_claves(monkeypatch, logs_json):
    # Datos reales con proveedor fake (RN-12): la regla es del modelo, no de una variable; su mensaje nombra las claves.
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("REAL_ANONYMIZED_ENABLED", "true")

    with pytest.raises(SystemExit):
        cargar_settings_o_salir()

    eventos = parsear_lineas_json(logs_json())
    assert len(eventos) == 1
    assert eventos[0]["event"] == "configuracion_invalida"
    assert eventos[0]["motivo"] == "valor_invalido"
    assert "REAL_ANONYMIZED_ENABLED" in eventos[0]["regla"]
    assert "variable" not in eventos[0]


@pytest.mark.ac("US-037", 2)
@pytest.mark.parametrize(
    "clave", ["RELEVANCE_THRESHOLD", "RETRIEVAL_TOP_K", "RERANK_TOP_N", "NLI_ENTAILMENT_THRESHOLD"]
)
def test_arranque_con_llm_local_sale_con_variable_ausente_cuando_falta_un_valor_de_recuperacion(
    clave, monkeypatch, logs_json
):
    entorno = {
        "RELEVANCE_THRESHOLD": "0.3",
        "RETRIEVAL_TOP_K": "40",
        "RERANK_TOP_N": "10",
        "NLI_ENTAILMENT_THRESHOLD": "0.7",
        "LLM_PROVIDER": "local",
        "CLINICAL_CATALOG_PATH": str(CATALOGOS),  # un solo evento: el del valor que falta
    }
    for nombre, valor in entorno.items():
        monkeypatch.setenv(nombre, valor)
    monkeypatch.delenv(clave)

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    eventos = parsear_lineas_json(logs_json())
    assert salida.value.code == 1
    assert len(eventos) == 1
    assert eventos[0]["event"] == "configuracion_invalida"
    assert eventos[0]["variable"] == clave
    assert eventos[0]["motivo"] == "variable_ausente"


def test_arranque_devuelve_los_settings_sin_registrar_nada_cuando_la_configuracion_es_valida(
    monkeypatch, logs_json
):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("RELEVANCE_THRESHOLD", "0.42")
    monkeypatch.setenv(
        "CLINICAL_CATALOG_PATH", str(CATALOGOS)
    )  # el catálogo montado es obligatorio (US-041)

    settings = cargar_settings_o_salir()

    assert settings.relevance_threshold == 0.42
    assert logs_json() == ""
