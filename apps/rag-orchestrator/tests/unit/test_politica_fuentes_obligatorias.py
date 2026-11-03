"""La política de licencias no falla abierta: exige la lista de fuentes admitidas (RN-21, ADR-36 Decisión 7)."""

from __future__ import annotations

import pytest

from app.config.settings import MAPA_DE_LICENCIAS_POR_DEFECTO
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias


def test_la_politica_de_licencias_exige_las_fuentes_admitidas_cuando_se_construye() -> None:
    with pytest.raises(TypeError):
        PoliticaDeLicencias(  # type: ignore[call-arg]
            aceptadas=frozenset({"dominio_publico"}),
            excluidas=("NCCN", "ESMO"),
            mapa_de_clases=MAPA_DE_LICENCIAS_POR_DEFECTO,
        )
