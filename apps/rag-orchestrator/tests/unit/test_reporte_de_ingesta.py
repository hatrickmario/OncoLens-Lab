"""Reporte de la ingesta en lote (US-117a AC-4): contadores por estado y salida sin contenido."""

from __future__ import annotations

from app.application.corpus_ingestion.reporte import Estado, ReporteDeIngesta, ResultadoDeIngesta


def _reporte(*resultados: ResultadoDeIngesta) -> ReporteDeIngesta:
    return ReporteDeIngesta(resultados, None)


def test_los_contadores_incluyen_los_cuatro_estados_aunque_valgan_cero() -> None:
    assert _reporte().contadores() == {
        "embebido": 0,
        "omitido": 0,
        "rechazado_licencia": 0,
        "error": 0,
    }


def test_los_contadores_cuentan_cada_documento_en_su_estado() -> None:
    reporte = _reporte(
        ResultadoDeIngesta("a", Estado.EMBEBIDO),
        ResultadoDeIngesta("b", Estado.EMBEBIDO),
        ResultadoDeIngesta("c", Estado.OMITIDO),
        ResultadoDeIngesta("d", Estado.ERROR, "milvus: ConnectionError"),
    )

    assert reporte.contadores() == {
        "embebido": 2,
        "omitido": 1,
        "rechazado_licencia": 0,
        "error": 1,
    }


def test_hubo_errores_solo_cuando_algun_documento_termino_en_error() -> None:
    assert not _reporte(
        ResultadoDeIngesta("a", Estado.RECHAZADO_LICENCIA, "fuente_excluida")
    ).hubo_errores
    assert _reporte(ResultadoDeIngesta("a", Estado.ERROR, "texto: TextoVacio")).hubo_errores


def test_el_diccionario_del_reporte_lleva_resultado_y_motivo_por_documento_y_el_resumen() -> None:
    reporte = ReporteDeIngesta(
        (ResultadoDeIngesta("a", Estado.ERROR, "sparse: VectorSparseVacio"),), "release-1"
    )

    salida = reporte.como_diccionario()

    assert salida["documentos"][0]["document_key"] == "a"
    assert salida["documentos"][0]["estado"] == "error"
    assert salida["documentos"][0]["motivo"] == "sparse: VectorSparseVacio"
    assert salida["resumen"]["error"] == 1 and salida["release_id"] == "release-1"
