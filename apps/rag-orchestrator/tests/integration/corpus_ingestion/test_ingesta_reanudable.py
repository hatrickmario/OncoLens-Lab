"""Ingesta reanudable con checkpoint por documento (US-117a AC-2, L1D-116).

La interrupción "a la fuerza" es un ``KeyboardInterrupt`` del embedder falso (no es ``Exception``: el servicio no la
captura) y lo único que sobrevive a ella es el catálogo y el almacén de chunks. Corre sobre memoria y, donde hay
Compose de test, sobre PostgreSQL y Milvus reales (``montaje_en_ambos``).
"""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import (
    DOCUMENTOS_ADMISIBLES_FX_06C_B,
    FILAS_DEL_CATALOGO_FX_06C_B,
    chunks_esperados_fx_06c_b,
    textos_esperados_fx_06c_b,
)

TERCER_DOCUMENTO_ADMISIBLE = 3


def _reiniciar_contadores(montaje: Montaje) -> None:
    montaje.embedder.interrumpir_en = None
    montaje.embedder.invocaciones = 0
    montaje.embedder.textos_recibidos.clear()
    montaje.sparse.invocaciones = 0


@pytest.mark.ac("US-117a", 2)
def test_ingesta_interrumpida_tras_segundo_documento_solo_procesa_los_restantes(
    montaje_en_ambos: Montaje,
) -> None:
    """[US-117a AC-2] Una ingesta interrumpida tras el segundo documento solo procesa los restantes al relanzarse."""
    montaje = montaje_en_ambos
    montaje.embedder.interrumpir_en = TERCER_DOCUMENTO_ADMISIBLE
    with pytest.raises(KeyboardInterrupt):
        montaje.ingerir()
    assert [s for s, _ in montaje.filas_de("i-lit-1")] == ["embebido"]
    assert [s for s, _ in montaje.filas_de("i-lit-2")] == ["normalizado"]
    _reiniciar_contadores(montaje)

    reporte = montaje.ingerir()

    assert reporte.resultado_de("i-lit-2").reanudado
    assert not reporte.resultado_de("i-gl-1").reanudado
    assert montaje.embedder.invocaciones == 2
    assert set(montaje.embedder.textos_recibidos) == textos_esperados_fx_06c_b("i-lit-2", "i-gl-1")
    assert montaje.chunks_por_clave() == chunks_esperados_fx_06c_b()
    assert montaje.total_de_filas() == FILAS_DEL_CATALOGO_FX_06C_B


@pytest.mark.ac("US-117a", 2)
def test_ingesta_terminada_relanzada_no_re_embebe_ni_cambia_los_recuentos(
    montaje_en_ambos: Montaje,
) -> None:
    """[US-117a AC-2] (asumido) Relanzar una ingesta terminada no cambia nada."""
    montaje = montaje_en_ambos
    montaje.ingerir()
    chunks, filas = montaje.chunks_por_clave(), montaje.total_de_filas()
    _reiniciar_contadores(montaje)

    reporte = montaje.ingerir()

    assert montaje.embedder.invocaciones == 0 and montaje.sparse.invocaciones == 0
    assert (montaje.chunks_por_clave(), montaje.total_de_filas()) == (chunks, filas)
    assert {reporte.resultado_de(c).estado for c in DOCUMENTOS_ADMISIBLES_FX_06C_B} == {
        Estado.OMITIDO
    }
