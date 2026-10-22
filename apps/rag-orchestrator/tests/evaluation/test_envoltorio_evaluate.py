"""Humo del envoltorio `npm run evaluate` (proceso real, con tiempo máximo explícito) y del baseline.json (US-072a)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from tests.evaluation.conftest import RAIZ_REPO

ENVOLTORIO = RAIZ_REPO / "scripts" / "eval" / "evaluate.mjs"
BASELINE = RAIZ_REPO / "data" / "evaluation" / "baseline.json"
TIEMPO_MAXIMO_S = 120


def correr(*argumentos: str, salida: Path, nombre: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "node",
            str(ENVOLTORIO),
            *argumentos,
            "--salida",
            str(salida),
            "--nombre-archivo",
            nombre,
        ],
        capture_output=True,
        text=True,
        timeout=TIEMPO_MAXIMO_S,
        env={"PATH": os.environ["PATH"], "EVAL_PYTHON": sys.executable},
        check=False,
    )


def test_el_envoltorio_corre_la_suite_de_la_ci_y_escribe_el_json(tmp_path: Path) -> None:
    proceso = correr("--suite", "all", "--report", "json", salida=tmp_path, nombre="r.json")

    assert proceso.returncode == 0, proceso.stderr
    assert json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))["suite"] == "all"


def test_el_envoltorio_devuelve_el_codigo_de_la_suite_cuando_la_familia_no_esta_disponible(
    tmp_path: Path,
) -> None:
    proceso = correr("--suite", "ocr", "--report", "json", salida=tmp_path, nombre="r.json")

    assert proceso.returncode == 2
    assert not (tmp_path / "r.json").exists()


def test_el_baseline_versionado_es_el_de_la_configuracion_de_la_ci_con_su_huella(
    tmp_path: Path,
) -> None:
    proceso = correr("--suite", "all", "--report", "json", salida=tmp_path, nombre="nuevo.json")

    assert proceso.returncode == 0, proceso.stderr
    assert BASELINE.read_bytes() == (tmp_path / "nuevo.json").read_bytes(), (
        "baseline.json no corresponde a la configuración actual: regenerarlo con "
        "`npm run evaluate -- --suite all --report json --salida data/evaluation --nombre-archivo baseline.json`"
    )
