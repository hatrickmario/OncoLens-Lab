"""Aceptación del barrido del umbral de relevancia y del baseline técnico (US-073, L1D-236), con FX-T5a-a y adapters falsos."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pytest
import yaml

from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
METAS = RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml"
GRILLA = [0.2, 0.5, 0.9, 1.0]
METRICAS = (
    "recall@10",
    "recall@10 es→en",
    "MRR",
    "fidelidad (proxy)",
    "precisión de citas",
    "sin evidencia",
)


def config_de_barrido(tmp_path: Path) -> Path:
    """La configuración de la CI con una grilla de 4 valores (el último descarta todo el corpus) y referencia 0.5."""
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["relevance_threshold"] = 0.5
    crudo["barrido"] = {
        "relevance_threshold_grid": GRILLA,
        "umbral_de_referencia": 0.5,
        "tolerancia_recall": 0.05,
    }
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def barrer(salida: Path, config: Path, *extra: str) -> int:
    return main(
        [
            "--config",
            str(config),
            "--sweep",
            "relevance_threshold",
            "--salida",
            str(salida),
            *extra,
        ],
        reloj=RelojFijo(),
    )


def filas_de_la_tabla(informe: str) -> dict[str, list[str]]:
    """Filas ``| <umbral> | <exactitud> | <recall> |`` de la tabla del barrido, por umbral."""
    filas = re.findall(r"^\| (\d\.\d{2}) \| ([\d.]+) \| ([\d.]+) \|$", informe, flags=re.MULTILINE)
    return {umbral: [exactitud, recall] for umbral, exactitud, recall in filas}


@pytest.mark.ac("US-073", 1)
def test_barrido_muestra_cada_valor_y_fija_el_elegido_en_configuracion_cuando_se_barre_la_grilla(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)

    codigo = barrer(tmp_path / "salida", config, "--fijar")

    assert codigo == 0
    informe = (tmp_path / "salida" / "S1-baseline.md").read_text(encoding="utf-8")
    assert filas_de_la_tabla(informe) == {
        "0.20": ["1.000", "1.000"],
        "0.50": ["1.000", "1.000"],
        "0.90": ["1.000", "1.000"],
        "1.00": ["0.333", "0.000"],
    }
    assert "Elegido: 0.90" in informe and "Justificación:" in informe
    assert cargar_config_suite(config).umbrales.relevance_threshold == 0.9


def test_barrido_no_toca_la_configuracion_cuando_no_se_pide_fijar(tmp_path: Path) -> None:
    config = config_de_barrido(tmp_path)
    antes = config.read_bytes()

    codigo = barrer(tmp_path / "salida", config)

    assert (codigo, config.read_bytes()) == (0, antes)


@pytest.mark.ac("US-073", 1)
def test_barrido_repetido_con_la_configuracion_de_prueba_da_tablas_identicas(
    tmp_path: Path,
) -> None:
    config = config_de_barrido(tmp_path)

    codigos = (barrer(tmp_path / "a", config), barrer(tmp_path / "b", config))

    assert codigos == (0, 0)
    informes = [(tmp_path / d / "S1-baseline.md").read_bytes() for d in ("a", "b")]
    assert informes[0] == informes[1]


@pytest.mark.ac("US-073", 4)
def test_informe_marca_cada_metrica_en_meta_o_fuera_de_meta_sin_tocar_el_archivo_de_metas(
    tmp_path: Path,
) -> None:
    metas_antes = hashlib.sha256(METAS.read_bytes()).hexdigest()

    codigo = barrer(tmp_path / "salida", config_de_barrido(tmp_path))

    assert codigo == 0
    informe = (tmp_path / "salida" / "S1-baseline.md").read_text(encoding="utf-8")
    sin_marca = [
        m
        for m in METRICAS
        if not re.search(
            rf"^\| {re.escape(m)} \|.*\| (en meta|fuera de meta) \|$", informe, re.MULTILINE
        )
    ]
    assert sin_marca == []
    assert hashlib.sha256(METAS.read_bytes()).hexdigest() == metas_antes


@pytest.mark.ac("US-073", 3)
def test_informe_anota_el_p95_fuera_de_meta_como_insumo_de_adr_42_sin_cambiar_la_meta(
    tmp_path: Path,
) -> None:
    metas_antes = METAS.read_bytes()

    codigo = barrer(tmp_path / "salida", config_de_barrido(tmp_path), "--p95-e2e-s", "18.4")

    assert codigo == 0
    informe = (tmp_path / "salida" / "S1-baseline.md").read_text(encoding="utf-8")
    assert "p95 de /platform/evidence-analyses | 18.4 s | ≤ 15 s | fuera de meta" in informe
    assert "insumo de ADR-42" in informe
    assert METAS.read_bytes() == metas_antes


def test_informe_no_anota_adr_42_cuando_el_p95_esta_en_meta(tmp_path: Path) -> None:
    codigo = barrer(tmp_path / "salida", config_de_barrido(tmp_path), "--p95-e2e-s", "12.0")

    assert codigo == 0
    informe = (tmp_path / "salida" / "S1-baseline.md").read_text(encoding="utf-8")
    assert "en meta" in informe and "insumo de ADR-42" not in informe
