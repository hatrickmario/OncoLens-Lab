"""Ingesta reanudable con checkpoint por documento (US-117a AC-2, L1D-116).

La interrupción "a la fuerza" es un ``KeyboardInterrupt`` del embedder falso (no es ``Exception``: el servicio no la
captura) y lo único que sobrevive a ella es el catálogo y el almacén de chunks.
"""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje, montar
from tests.support.ingesta import DOCUMENTOS_ADMISIBLES_FX_06C_B

TERCER_DOCUMENTO_ADMISIBLE = 3


def _reiniciar_contadores(montaje: Montaje) -> None:
    montaje.embedder.interrumpir_en = None
    montaje.embedder.invocaciones = 0
    montaje.embedder.textos_recibidos.clear()
    montaje.sparse.invocaciones = 0


@pytest.mark.ac("US-117a", 2)
def test_ingesta_interrumpida_tras_segundo_documento_solo_procesa_los_restantes(
    montaje: Montaje,
) -> None:
    """[US-117a AC-2] Una ingesta interrumpida tras el segundo documento solo procesa los restantes al relanzarse."""
    sin_interrupcion = montar()
    sin_interrupcion.ingerir()

    montaje.embedder.interrumpir_en = TERCER_DOCUMENTO_ADMISIBLE
    with pytest.raises(KeyboardInterrupt):
        montaje.ingerir()
    estados_tras_la_interrupcion = {
        i.split("@")[0]: r.status for i, r in montaje.catalogo.documentos.items()
    }
    assert estados_tras_la_interrupcion["i-lit-1"] == "embebido"
    _reiniciar_contadores(montaje)

    reporte = montaje.ingerir()

    assert (
        reporte.resultado_de("i-lit-2").reanudado and not reporte.resultado_de("i-gl-1").reanudado
    )
    textos_de_los_restantes = {
        c.chunk_text
        for c in sin_interrupcion.almacen.chunks.values()
        if c.document_id.split("@")[0] in ("i-lit-2", "i-gl-1")
    }
    assert montaje.embedder.invocaciones == 2
    assert set(montaje.embedder.textos_recibidos) == textos_de_los_restantes
    assert montaje.chunks_por_clave() == sin_interrupcion.chunks_por_clave()
    assert len(montaje.catalogo.documentos) == len(sin_interrupcion.catalogo.documentos)


@pytest.mark.ac("US-117a", 2)
def test_ingesta_terminada_relanzada_no_re_embebe_ni_cambia_los_recuentos(
    montaje: Montaje,
) -> None:
    """[US-117a AC-2] (asumido) Relanzar una ingesta terminada no cambia nada."""
    montaje.ingerir()
    chunks, filas = montaje.chunks_por_clave(), len(montaje.catalogo.documentos)
    _reiniciar_contadores(montaje)

    reporte = montaje.ingerir()

    assert montaje.embedder.invocaciones == 0 and montaje.sparse.invocaciones == 0
    assert (montaje.chunks_por_clave(), len(montaje.catalogo.documentos)) == (chunks, filas)
    assert {reporte.resultado_de(c).estado for c in DOCUMENTOS_ADMISIBLES_FX_06C_B} == {
        Estado.OMITIDO
    }
