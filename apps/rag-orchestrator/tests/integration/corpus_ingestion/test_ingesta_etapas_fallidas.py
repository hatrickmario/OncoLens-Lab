"""Cada etapa que falla deja el documento en error con su etapa y clase, sin detener el lote (US-117a D4)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import documentos_fx_06c_b

CLAVE_AFECTADA = "i-lit-1"
OTRAS_ADMISIBLES = ("i-ct-1", "i-lit-2", "i-gl-1")


def _ingerir_con_la_clave_afectada(montaje: Montaje, **cambios: object):
    documentos = [
        replace(d, **cambios) if d.document_key == CLAVE_AFECTADA else d  # type: ignore[arg-type]
        for d in documentos_fx_06c_b()
    ]
    return montaje.servicio.ingerir(documentos)


def _sin_texto_en_disco(montaje: Montaje):
    return _ingerir_con_la_clave_afectada(montaje, ruta_texto="no-existe.txt")


def _con_checksum_distinto(montaje: Montaje):
    return _ingerir_con_la_clave_afectada(montaje, checksum_esperado="0" * 64)


def _con_texto_vacio(montaje: Montaje):
    return _ingerir_con_la_clave_afectada(montaje, texto="  \n ", ruta_texto=None)


def _con_embeddings_caidos(montaje: Montaje):
    montaje.embedder.error = ConnectionError("modelo no disponible")
    return montaje.ingerir()


def _con_sparse_caido(montaje: Montaje):
    montaje.sparse.error = RuntimeError("modelo sparse no disponible")
    return montaje.ingerir()


def _con_sparse_vacio(montaje: Montaje):
    montaje.sparse.devolver_vacios = True
    return montaje.ingerir()


def _con_milvus_caido(montaje: Montaje):
    montaje.almacen.fallar_en["upsert_chunks"] = ConnectionError("milvus caído")
    return montaje.ingerir()


CASOS = [
    ("obtener_texto", "FileNotFoundError", _sin_texto_en_disco),
    ("integridad", "ChecksumDelManifiestoNoCoincide", _con_checksum_distinto),
    ("texto", "TextoVacio", _con_texto_vacio),
    ("embeddings", "ConnectionError", _con_embeddings_caidos),
    ("sparse", "RuntimeError", _con_sparse_caido),
    ("sparse", "VectorSparseVacio", _con_sparse_vacio),
    ("milvus", "ConnectionError", _con_milvus_caido),
]


@pytest.mark.parametrize(("etapa", "clase", "provocar"), CASOS)
def test_ingesta_deja_error_con_etapa_y_clase_sin_chunks_vigentes_cuando_falla_la_etapa(
    montaje: Montaje, etapa: str, clase: str, provocar: Callable[[Montaje], object]
) -> None:
    reporte = provocar(montaje)

    afectado = reporte.resultado_de(CLAVE_AFECTADA)  # type: ignore[attr-defined]
    assert (afectado.estado, afectado.motivo) == (Estado.ERROR, f"{etapa}: {clase}")
    filas = [
        r for i, r in montaje.catalogo.documentos.items() if i.startswith(f"{CLAVE_AFECTADA}@")
    ]
    assert [(r.status, r.is_current) for r in filas] == [("error", False)]
    assert not [
        c
        for c in montaje.almacen.chunks.values()
        if c.document_id.startswith(f"{CLAVE_AFECTADA}@") and c.is_current
    ]


def test_ingesta_sigue_con_los_demas_documentos_cuando_uno_falla_en_su_etapa(
    montaje: Montaje,
) -> None:
    reporte = _sin_texto_en_disco(montaje)

    assert {reporte.resultado_de(c).estado for c in OTRAS_ADMISIBLES} == {Estado.EMBEBIDO}


def test_ingesta_no_captura_la_interrupcion_del_proceso(montaje: Montaje) -> None:
    montaje.embedder.interrumpir_en = 1

    with pytest.raises(KeyboardInterrupt):
        montaje.ingerir()

    assert [r.status for r in montaje.catalogo.documentos.values()] == ["normalizado"]
