"""Retiro por rechazo (RN-21, RN-05) y reconciliación de lo omitido en la ingesta en lote (US-117a, L1D-116)."""

from __future__ import annotations

from dataclasses import replace

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import documentos_fx_06c_b

CLAVE = "i-lit-1"


def _filas(montaje: Montaje) -> dict[str, object]:
    return {i: r for i, r in montaje.catalogo.documentos.items() if i.startswith(f"{CLAVE}@")}


def _chunks_vigentes(montaje: Montaje) -> int:
    return sum(
        1
        for c in montaje.almacen.chunks.values()
        if c.document_id.startswith(f"{CLAVE}@") and c.is_current
    )


def _ingerir_con_licencia_nd(montaje: Montaje):
    """El mismo documento, ahora con una licencia que no se acepta (CC BY-ND)."""
    documentos = [
        replace(d, license="CC BY-ND 4.0") if d.document_key == CLAVE else d
        for d in documentos_fx_06c_b()
    ]
    return montaje.servicio.ingerir(documentos)


def test_rechazo_de_un_documento_ya_vigente_lo_retira_sin_borrar_nada(montaje: Montaje) -> None:
    montaje.ingerir()
    id_vigente = next(i for i in _filas(montaje))
    assert _chunks_vigentes(montaje) > 0

    reporte = _ingerir_con_licencia_nd(montaje)

    rechazo = reporte.resultado_de(CLAVE)
    assert (rechazo.estado, rechazo.retirada_de_vigente) == (Estado.RECHAZADO_LICENCIA, True)
    filas = _filas(montaje)
    assert filas[id_vigente].is_current is False  # type: ignore[attr-defined]
    assert filas[id_vigente].status == "embebido"  # type: ignore[attr-defined]
    assert f"{CLAVE}@rechazado" in filas
    assert _chunks_vigentes(montaje) == 0
    assert any(c.document_id == id_vigente for c in montaje.almacen.chunks.values())


def test_rechazo_con_milvus_caido_en_el_retiro_queda_error_sin_fila_de_rechazo(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    id_vigente = next(i for i in _filas(montaje))
    montaje.almacen.fallar_en["marcar_no_vigentes"] = ConnectionError("milvus caído")

    reporte = _ingerir_con_licencia_nd(montaje)

    resultado = reporte.resultado_de(CLAVE)
    assert (resultado.estado, resultado.motivo) == (Estado.ERROR, "retiro: ConnectionError")
    filas = _filas(montaje)
    assert f"{CLAVE}@rechazado" not in filas
    assert filas[id_vigente].is_current is True  # type: ignore[attr-defined]


def test_omitir_vuelve_a_encender_los_chunks_de_la_vigente_que_un_fallo_dejo_apagados(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    id_vigente = next(i for i in _filas(montaje))
    montaje.almacen.marcar_no_vigentes(id_vigente)
    assert _chunks_vigentes(montaje) == 0

    reporte = montaje.ingerir()

    assert reporte.resultado_de(CLAVE).estado is Estado.OMITIDO
    assert _chunks_vigentes(montaje) > 0


def test_omitir_con_milvus_caido_al_encender_deja_error_sin_tocar_el_catalogo(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    filas_antes = dict(_filas(montaje))
    montaje.almacen.marcar_no_vigentes(next(i for i in filas_antes))
    montaje.almacen.fallar_en["marcar_vigentes"] = ConnectionError("milvus caído")

    reporte = montaje.ingerir()

    resultado = reporte.resultado_de(CLAVE)
    assert (resultado.estado, resultado.motivo) == (Estado.ERROR, "milvus: ConnectionError")
    assert _filas(montaje) == filas_antes
