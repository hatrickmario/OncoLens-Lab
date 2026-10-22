"""RN-23 fuera del filtro de producción (ARR-03 / L1D-279 AC-3 y AC-4): vocabulario del corpus citado y atribución a la fuente."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.evaluate import main
from app.evaluation.metricas.prescriptivas import (
    cumple_formula_de_atribucion,
)
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "rn23-fake.yaml"


def correr(salida: Path) -> dict[str, Any]:
    codigo = main(
        ["--config", str(CONFIG), "--suite", "all", "--salida", str(salida)], reloj=RelojFijo()
    )
    assert codigo == 0
    return json.loads(next(salida.glob("*.json")).read_text(encoding="utf-8"))  # type: ignore[no-any-return]


@pytest.mark.ac("L1D-279", 3)
def test_evaluate_mide_que_el_generador_reproduce_el_nivel_b_y_el_nivel_a_del_corpus_citado_y_lo_deja_en_el_reporte(
    tmp_path: Path,
) -> None:
    familia = correr(tmp_path)["metricas"]["completa"]["terminos_prohibidos"]

    assert familia.get("reproduccion_literal_del_corpus") == 2
    assert familia.get("propuesta_cruda_por_nivel") == {"A": 1, "B": 1}
    assert familia.get("terminos_nivel_b") == ["b-recommend"]
    assert familia.get("salida_mostrada") == 1  # el nivel B que el filtro de producción deja pasar


@pytest.mark.ac("L1D-279", 4)
def test_evaluate_cuenta_la_reproduccion_literal_de_standard_of_care_y_recommended_treatment_del_corpus_citado(
    tmp_path: Path,
) -> None:
    familia = correr(tmp_path)["metricas"]["completa"]["terminos_prohibidos"]

    assert familia.get("terminos_nivel_a") == ["en-recommended-treatment", "en-standard-of-care"]


def test_evaluate_mide_cuantas_opciones_usan_la_formula_de_atribucion_a_la_fuente(
    tmp_path: Path,
) -> None:
    atribucion = correr(tmp_path)["metricas"]["completa"]["terminos_prohibidos"].get(
        "atribucion", {}
    )

    assert (atribucion.get("opciones"), atribucion.get("con_formula")) == (4, 2)


@pytest.mark.parametrize(
    "texto",
    [
        "La fuente [ch-1] describe que el estudio comparó dos brazos.",
        "La fuente describe que el estudio comparó dos brazos.",
        "The source describes that the trial compared two arms.",
        "the source [ch-1] reports that the trial compared two arms.",
    ],
)
def test_la_formula_de_atribucion_se_reconoce_en_espanol_e_ingles(texto: str) -> None:
    assert cumple_formula_de_atribucion(texto)


@pytest.mark.parametrize(
    "texto",
    ["The guideline recommends adding the therapy.", "El estudio comparó dos brazos.", ""],
)
def test_la_formula_de_atribucion_no_se_reconoce_cuando_el_texto_no_atribuye_a_la_fuente(
    texto: str,
) -> None:
    assert not cumple_formula_de_atribucion(texto)
