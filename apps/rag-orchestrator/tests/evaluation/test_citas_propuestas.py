"""Cuenta de citas propuestas en la evaluación (M-07.2) con las citas no traducibles de US-236."""

import pytest

from app.domain.alias_de_chunks import asignar_alias, traducir_citas
from app.domain.citations import OpcionGenerada, validar_citas
from app.domain.relevance import ChunkPuntuado
from app.evaluation.corrida import citas_propuestas_de


def _opcion(*citas: str) -> OpcionGenerada:
    return OpcionGenerada("opción", "razón", tuple(citas))


@pytest.mark.ac("US-236", 7)
def test_citas_propuestas_cuenta_cada_alias_inexistente_aparte_y_la_precision_no_se_infla():
    tabla = asignar_alias([ChunkPuntuado("ch-a", "doc", "texto", 0.9)])
    opcion = _opcion(*traducir_citas(tabla, ["C9", "C7", "C1"]))

    revisadas = validar_citas([opcion], {"ch-a"})

    assert citas_propuestas_de([opcion]) == 3
    assert sum(len(a.chunk_ids_validos) for a in revisadas.aceptadas) == 1


def test_citas_propuestas_cuenta_dos_veces_el_mismo_alias_inexistente_repetido():
    tabla = asignar_alias([ChunkPuntuado("ch-a", "doc", "texto", 0.9)])

    assert citas_propuestas_de([_opcion(*traducir_citas(tabla, ["C9", "C9"]))]) == 2


def test_citas_propuestas_deduplica_solo_los_chunk_id_reales_repetidos():
    assert citas_propuestas_de([_opcion("ch-a", "ch-a", "ch-b")]) == 2


def test_citas_propuestas_suma_las_citas_de_todas_las_opciones():
    assert citas_propuestas_de([_opcion("ch-a"), _opcion("ch-a", "ch-b")]) == 3
