"""Catálogo clínico ausente al arrancar: el servicio no queda listo y el log no lleva la ruta (US-041 AC-5, D4)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.bootstrap import cargar_settings_o_salir, crear_app
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from tests.support.contract import CATALOGOS, RAIZ_REPOSITORIO
from tests.support.fakes import settings_de_prueba
from tests.support.logs import exigir_sin_valores_prohibidos, parsear_lineas_json

RAIZ_SERVICIO = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator"
SENTINELA_DE_RUTA = "SENTINELA-CATALOGO-AUSENTE"
CLAVES_QUE_EL_TEST_FIJA = {"CLINICAL_CATALOG_PATH", "LLM_PROVIDER", "MODEL_PROVIDER"}
EVENTO_ESPERADO = {
    "event": "configuracion_invalida",
    "variable": "CLINICAL_CATALOG_PATH",
    "regla": "manifest.json legible",
    "motivo": "catalogo_no_disponible",
}


def _entorno_sin_catalogo(ruta: Path) -> dict[str, str]:
    base = {k: v for k, v in os.environ.items() if k.upper() not in CLAVES_QUE_EL_TEST_FIJA}
    return {**base, "LLM_PROVIDER": "fake", "CLINICAL_CATALOG_PATH": str(ruta)}


@pytest.mark.ac("US-041", 5)
def test_arranque_sin_catalogo_no_queda_listo_y_log_sin_ruta(tmp_path):
    ruta_ausente = tmp_path / SENTINELA_DE_RUTA  # no existe

    resultado = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        check=False,
        cwd=RAIZ_SERVICIO,
        env=_entorno_sin_catalogo(ruta_ausente),
        capture_output=True,
        text=True,
        timeout=120,
    )

    salida = resultado.stdout + resultado.stderr
    eventos = [e for e in parsear_lineas_json(resultado.stdout) if e.get("event")]
    assert resultado.returncode == 1
    assert len(eventos) == 1
    assert {k: eventos[0][k] for k in EVENTO_ESPERADO} == EVENTO_ESPERADO
    exigir_sin_valores_prohibidos(salida, [SENTINELA_DE_RUTA, str(tmp_path)])


def test_arranque_registra_catalogo_no_disponible_cuando_el_manifiesto_no_es_json_valido(
    tmp_path, monkeypatch, logs_json
):
    (tmp_path / "manifest.json").write_text("SENTINELA-CONTENIDO {no es json", encoding="utf-8")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("CLINICAL_CATALOG_PATH", str(tmp_path))

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    registrado = logs_json()
    eventos = parsear_lineas_json(registrado)
    assert salida.value.code == 1
    assert eventos[0]["motivo"] == "catalogo_no_disponible"
    exigir_sin_valores_prohibidos(registrado, ["SENTINELA-CONTENIDO", str(tmp_path)])


def test_arranque_registra_variable_ausente_cuando_la_ruta_del_catalogo_no_esta_configurada(
    monkeypatch, logs_json
):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("CLINICAL_CATALOG_PATH", raising=False)

    with pytest.raises(SystemExit) as salida:
        cargar_settings_o_salir()

    eventos = parsear_lineas_json(logs_json())
    assert salida.value.code == 1
    assert len(eventos) == 1
    assert eventos[0]["variable"] == "CLINICAL_CATALOG_PATH"
    assert eventos[0]["motivo"] == "variable_ausente"


def test_arranque_registra_un_evento_por_variable_cuando_faltan_valores_de_recuperacion_y_el_catalogo(
    tmp_path, monkeypatch, logs_json
):
    for nombre, valor in {
        "RETRIEVAL_TOP_K": "40",
        "RERANK_TOP_N": "10",
        "NLI_ENTAILMENT_THRESHOLD": "0.7",
        "LLM_PROVIDER": "local",
        "CLINICAL_CATALOG_PATH": str(tmp_path),  # sin manifest.json
    }.items():
        monkeypatch.setenv(nombre, valor)
    monkeypatch.delenv("RELEVANCE_THRESHOLD", raising=False)

    with pytest.raises(SystemExit):
        cargar_settings_o_salir()

    registrado = logs_json()
    eventos = parsear_lineas_json(registrado)
    assert {e["variable"]: e["motivo"] for e in eventos} == {
        "RELEVANCE_THRESHOLD": "variable_ausente",
        "CLINICAL_CATALOG_PATH": "catalogo_no_disponible",
    }
    exigir_sin_valores_prohibidos(registrado, [str(tmp_path)])


def test_crear_app_lanza_catalogo_no_disponible_cuando_la_ruta_del_catalogo_es_none():
    settings = settings_de_prueba(clinical_catalog_path=None)

    with pytest.raises(CatalogoNoDisponible):
        crear_app(settings)


def test_arranque_devuelve_los_settings_sin_registrar_nada_cuando_el_catalogo_es_legible(
    monkeypatch, logs_json
):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("CLINICAL_CATALOG_PATH", str(CATALOGOS))

    settings = cargar_settings_o_salir()

    assert settings.clinical_catalog_path == CATALOGOS
    assert logs_json() == ""


def test_la_sonda_detecta_la_ruta_inyectada_en_la_salida_del_arranque():
    # Mutación: si la comprobación de la ruta no mirara la salida real, un log con la ruta pasaría inadvertido.
    salida = (
        f'{{"event": "configuracion_invalida", "message": "no existe /tmp/{SENTINELA_DE_RUTA}"}}'
    )

    with pytest.raises(AssertionError, match=SENTINELA_DE_RUTA):
        exigir_sin_valores_prohibidos(salida, [SENTINELA_DE_RUTA])
