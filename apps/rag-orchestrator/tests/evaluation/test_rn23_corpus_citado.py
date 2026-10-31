"""RN-23 fuera del filtro de producción (ARR-03 / L1D-279 AC-3 y AC-4): vocabulario del corpus citado y atribución a la fuente."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.evaluate import main
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.metricas import prescriptivas
from app.evaluation.metricas.prescriptivas import (
    cumple_formula_de_atribucion,
    medir_propuesta_cruda,
)
from app.infrastructure.lenguaje.terminos_prohibidos import (
    cargar_lista_de_terminos,
    cargar_verificador_de_terminos,
)
from app.prompts import rag_query
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
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

    assert familia.get("terminos_compartidos_con_corpus_citado") == 2
    assert familia.get("propuesta_cruda_por_nivel") == {"A": 1, "B": 1}
    assert familia.get("terminos_nivel_b") == ["b-recommend"]
    assert familia.get("salida_mostrada") == 1  # el nivel B que el filtro de producción deja pasar


@pytest.mark.ac("L1D-279", 3)
def test_evaluate_separa_lo_mostrado_por_nivel_y_lista_el_campo_y_la_regla_sin_texto(
    tmp_path: Path,
) -> None:
    familia = correr(tmp_path)["metricas"]["completa"]["terminos_prohibidos"]

    assert familia.get("salida_mostrada_nivel_a") == 0  # bloqueante
    assert familia.get("salida_mostrada_nivel_b") == 1  # seguimiento
    assert familia.get("salida_mostrada_por_nivel") == {"A": 0, "B": 1}
    mostrados = familia.get("campos_mostrados")
    assert [m["regla"] for m in mostrados] == ["b-recommend"]
    assert all(set(m) == {"campo", "regla"} for m in mostrados)


@pytest.mark.ac("L1D-279", 4)
def test_evaluate_cuenta_la_reproduccion_literal_de_standard_of_care_y_recommended_treatment_del_corpus_citado(
    tmp_path: Path,
) -> None:
    familia = correr(tmp_path)["metricas"]["completa"]["terminos_prohibidos"]

    assert familia.get("terminos_nivel_a") == ["en-recommended-treatment", "en-standard-of-care"]


@pytest.mark.ac("L1D-279", 3)
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


CATALOGOS = RAIZ_REPO / "packages" / "clinical-catalogs"


def test_un_campo_con_termino_de_nivel_a_y_de_nivel_b_cuenta_una_sola_vez_en_los_campos_con_termino() -> (
    None
):
    verificador = VerificadorEstricto(cargar_lista_de_terminos(CATALOGOS))
    texto = "It is the standard of care and the guideline recommends it."

    medido = medir_propuesta_cruda([("rationale", texto)], [texto], [], verificador)

    assert (medido.campos_nivel_a, medido.campos_nivel_b, medido.campos_con_termino) == (1, 1, 1)


def test_la_formula_de_atribucion_se_importa_del_modulo_del_prompt() -> None:
    assert prescriptivas.FORMULA_DE_ATRIBUCION is rag_query.FORMULA_DE_ATRIBUCION


@pytest.mark.parametrize(
    "texto", ["The guideline recommends it.", "It is the standard of care.", "Hola."]
)
def test_el_verificador_de_la_suite_con_nivel_a_da_los_mismos_ids_que_el_filtro_de_produccion(
    texto: str,
) -> None:
    lista = cargar_lista_de_terminos(CATALOGOS)
    suite = VerificadorEstricto(lista, niveles=("A",))
    produccion = cargar_verificador_de_terminos(CATALOGOS)

    ids = tuple(dict.fromkeys(c.id for c in suite.coincidencias_generadas(texto, "rationale")))

    assert ids == produccion.reglas_coincidentes(texto, "rationale")
