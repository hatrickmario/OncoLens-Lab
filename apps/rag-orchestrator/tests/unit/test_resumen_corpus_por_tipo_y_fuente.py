"""``contar_corpus_por_tipo_y_fuente()``: contadores del corpus vigente por tipo de cáncer y fuente (US-120 AC-1)."""

from __future__ import annotations

from app.application.corpus_ingestion.resumen_corpus import (
    contar_corpus_por_tipo_y_fuente,
    tipos_de_cancer_de,
)
from tests.support.registros import registro_de_prueba


def test_cuenta_cada_documento_vigente_en_su_tipo_y_su_fuente() -> None:
    filas = [
        registro_de_prueba("a@1", cancer_type_tags="mama", source_name="NCI"),
        registro_de_prueba("b@1", cancer_type_tags="mama", source_name="NCI"),
        registro_de_prueba("c@1", cancer_type_tags="prostata", source_name="PMC Open Access"),
    ]

    assert contar_corpus_por_tipo_y_fuente(filas) == {
        "mama": {"NCI": 2},
        "prostata": {"PMC Open Access": 1},
    }


def test_devuelve_vacio_cuando_no_hay_documentos_vigentes() -> None:
    assert contar_corpus_por_tipo_y_fuente([]) == {}


def test_cuenta_un_documento_con_varias_etiquetas_en_cada_tipo() -> None:
    filas = [registro_de_prueba("a@1", cancer_type_tags="mama,prostata", source_name="NCI")]

    assert contar_corpus_por_tipo_y_fuente(filas) == {"mama": {"NCI": 1}, "prostata": {"NCI": 1}}


def test_devuelve_los_tipos_y_las_fuentes_ordenados_para_que_el_resumen_sea_reproducible() -> None:
    filas = [
        registro_de_prueba("a@1", cancer_type_tags="prostata", source_name="PMC Open Access"),
        registro_de_prueba("b@1", cancer_type_tags="mama", source_name="NCI"),
        registro_de_prueba("c@1", cancer_type_tags="mama", source_name="ClinicalTrials.gov"),
    ]

    resumen = contar_corpus_por_tipo_y_fuente(filas)

    assert list(resumen) == ["mama", "prostata"]
    assert list(resumen["mama"]) == ["ClinicalTrials.gov", "NCI"]


def test_separa_las_etiquetas_por_coma_e_ignora_las_vacias() -> None:
    assert tipos_de_cancer_de(registro_de_prueba("a@1", cancer_type_tags="mama,,prostata")) == (
        "mama",
        "prostata",
    )
