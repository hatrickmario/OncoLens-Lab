"""La ingesta rechaza lo que no tiene licencia aceptada o viene de una fuente excluida (US-117a AC-3, RN-21)."""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reporte import Estado
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import DOCUMENTOS_ADMISIBLES_FX_06C_B


@pytest.mark.ac("US-117a", 3)
def test_ingesta_rechaza_nd_y_esmo_sin_chunks_y_continua(montaje: Montaje) -> None:
    """[US-117a AC-3] Un documento CC BY-ND y uno de ESMO se rechazan sin detener el lote."""
    reporte = montaje.ingerir()

    nd, esmo = reporte.resultado_de("i-nd"), reporte.resultado_de("i-esmo")
    assert (nd.estado, nd.motivo) == (Estado.RECHAZADO_LICENCIA, "licencia_no_aceptada")
    assert (esmo.estado, esmo.motivo) == (Estado.RECHAZADO_LICENCIA, "fuente_excluida")
    estados = {i.split("@")[0]: r.status for i, r in montaje.catalogo.documentos.items()}
    assert estados["i-nd"] == estados["i-esmo"] == "rechazado_licencia"
    assert not set(montaje.chunks_por_clave()) & {"i-nd", "i-esmo"}
    recibidos = " ".join(montaje.embedder.textos_recibidos)
    assert "forbids derivatives" not in recibidos and "source is excluded" not in recibidos
    assert all(estados[c] == "embebido" for c in DOCUMENTOS_ADMISIBLES_FX_06C_B)
