"""El formato del alias y el patrón del esquema del runtime comparten fuente (US-236, design D4)."""

import re

from app.application.generation import esquema_de_generacion
from app.domain.alias_de_chunks import PATRON_DE_ALIAS, asignar_alias
from app.domain.relevance import ChunkPuntuado


def test_el_esquema_entregado_al_runtime_usa_el_patron_de_alias_del_dominio():
    esquema = esquema_de_generacion(1, 4)

    items = esquema["$defs"]["_AfirmacionCruda"]["properties"]["citations"]["items"]
    assert items["pattern"] == PATRON_DE_ALIAS


def test_todo_alias_asignado_cumple_el_patron_de_alias():
    chunks = [ChunkPuntuado(f"ch-{n}", "doc", "texto", 1.0 - n / 100) for n in range(1, 13)]

    alias = [f.alias for f in asignar_alias(chunks).fragmentos]

    assert len(alias) == 12
    assert all(re.fullmatch(PATRON_DE_ALIAS, a) for a in alias)


def test_el_patron_de_alias_rechaza_un_chunk_id_real_y_las_variantes_no_canonicas():
    for no_alias in ("ch-m1-1", "C0", "C01", "c1", "[C1]", "C 1", ""):
        assert re.fullmatch(PATRON_DE_ALIAS, no_alias) is None
