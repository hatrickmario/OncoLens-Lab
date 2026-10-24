"""Regresión RN-05 (US-117a): la ingesta nunca borra; un contenido nuevo del mismo grupo deja la versión anterior no vigente.

El versionado como entregable (``i-gl-1-v2``, ``--reindex-sparse``) es de US-117b; esto solo protege que la ingesta no
deje dos versiones vigentes ni borre filas ni chunks de la anterior.
"""

from __future__ import annotations

from dataclasses import replace

from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import documentos_fx_06c_b


def test_ingesta_de_un_contenido_nuevo_deja_la_version_anterior_no_vigente_sin_borrarla(
    montaje: Montaje,
) -> None:
    montaje.ingerir()
    chunks_de_la_anterior = {
        c.chunk_id for c in montaje.almacen.chunks.values() if c.document_id.startswith("i-gl-1@")
    }
    documentos = [
        replace(d, texto="Texto sintético distinto de la guía, segunda versión.", ruta_texto=None)
        if d.document_key == "i-gl-1"
        else d
        for d in documentos_fx_06c_b()
    ]

    montaje.servicio.ingerir(documentos)

    filas = {i: r for i, r in montaje.catalogo.documentos.items() if i.startswith("i-gl-1@")}
    assert sorted(r.is_current for r in filas.values()) == [False, True]
    vigentes_en_milvus = {
        c.document_id
        for c in montaje.almacen.chunks.values()
        if c.document_id.startswith("i-gl-1@") and c.is_current
    }
    assert vigentes_en_milvus == {i for i, r in filas.items() if r.is_current}
    assert chunks_de_la_anterior <= set(montaje.almacen.chunks)
