"""``contar_corpus_por_tipo_y_fuente()``: contadores del corpus por tipo de cáncer y fuente (US-120 AC-1)."""

from __future__ import annotations

from app.application.corpus_ingestion.reporte import Estado, ReporteDeIngesta, ResultadoDeIngesta
from app.application.corpus_ingestion.resumen_corpus import contar_corpus_por_tipo_y_fuente
from tests.support.semilla import documento_de_prueba


def _reporte(**estados: Estado) -> ReporteDeIngesta:
    return ReporteDeIngesta(
        tuple(ResultadoDeIngesta(clave, estado) for clave, estado in estados.items()), None
    )


def test_cuenta_cada_documento_vigente_en_su_tipo_y_su_fuente_cuando_se_embebe() -> None:
    documentos = (
        documento_de_prueba(document_key="a", cancer_type_tags=("mama",), source_name="NCI"),
        documento_de_prueba(document_key="b", cancer_type_tags=("mama",), source_name="NCI"),
        documento_de_prueba(
            document_key="c", cancer_type_tags=("prostata",), source_name="PMC Open Access"
        ),
    )

    resumen = contar_corpus_por_tipo_y_fuente(
        documentos, _reporte(a=Estado.EMBEBIDO, b=Estado.EMBEBIDO, c=Estado.EMBEBIDO)
    )

    assert resumen == {"mama": {"NCI": 2}, "prostata": {"PMC Open Access": 1}}


def test_cuenta_un_documento_omitido_porque_sigue_vigente() -> None:
    documentos = (documento_de_prueba(document_key="a", source_name="NCI"),)

    resumen = contar_corpus_por_tipo_y_fuente(documentos, _reporte(a=Estado.OMITIDO))

    assert resumen == {"mama": {"NCI": 1}}


def test_no_cuenta_un_documento_rechazado_ni_con_error() -> None:
    documentos = (
        documento_de_prueba(document_key="a", source_name="NCI"),
        documento_de_prueba(document_key="b", source_name="NICE"),
    )

    resumen = contar_corpus_por_tipo_y_fuente(
        documentos, _reporte(a=Estado.ERROR, b=Estado.RECHAZADO_LICENCIA)
    )

    assert resumen == {}


def test_devuelve_los_tipos_y_las_fuentes_ordenados_para_que_el_resumen_sea_reproducible() -> None:
    documentos = (
        documento_de_prueba(
            document_key="a", cancer_type_tags=("prostata",), source_name="PMC Open Access"
        ),
        documento_de_prueba(document_key="b", cancer_type_tags=("mama",), source_name="NCI"),
        documento_de_prueba(
            document_key="c", cancer_type_tags=("mama",), source_name="ClinicalTrials.gov"
        ),
    )

    resumen = contar_corpus_por_tipo_y_fuente(
        documentos, _reporte(a=Estado.EMBEBIDO, b=Estado.EMBEBIDO, c=Estado.EMBEBIDO)
    )

    assert list(resumen) == ["mama", "prostata"]
    assert list(resumen["mama"]) == ["ClinicalTrials.gov", "NCI"]
