"""Alias efímeros de chunks (US-236 / L1D-287): regla pura de RN-04, sin adapters."""

import re

from app.domain.alias_de_chunks import CITA_NO_TRADUCIBLE, asignar_alias, traducir_citas
from app.domain.relevance import ChunkPuntuado


def _chunk(chunk_id: str, puntaje: float) -> ChunkPuntuado:
    return ChunkPuntuado(chunk_id, "doc", f"texto de {chunk_id}", puntaje)


def _tabla():
    return asignar_alias([_chunk("ch-b", 0.5), _chunk("ch-a", 0.9), _chunk("ch-c", 0.5)])


def test_asignar_alias_devuelve_una_tabla_vacia_cuando_no_hay_chunks():
    assert asignar_alias([]).fragmentos == ()


def test_asignar_alias_rotula_c1_cuando_hay_un_solo_chunk():
    (par,) = asignar_alias([_chunk("ch-a", 0.4)]).fragmentos

    assert (par.alias, par.chunk.chunk_id) == ("C1", "ch-a")


def test_asignar_alias_ordena_por_relevancia_descendente():
    tabla = asignar_alias([_chunk("ch-a", 0.2), _chunk("ch-b", 0.9)])

    assert [(f.alias, f.chunk.chunk_id) for f in tabla.fragmentos] == [
        ("C1", "ch-b"),
        ("C2", "ch-a"),
    ]


def test_asignar_alias_desempata_por_chunk_id_ascendente():
    tabla = _tabla()

    assert [f.chunk.chunk_id for f in tabla.fragmentos] == ["ch-a", "ch-b", "ch-c"]


def test_asignar_alias_es_independiente_del_orden_de_entrada():
    chunks = [_chunk("ch-b", 0.5), _chunk("ch-a", 0.9), _chunk("ch-c", 0.5)]

    assert asignar_alias(chunks) == asignar_alias(list(reversed(chunks)))


def test_traducir_citas_devuelve_el_chunk_id_real_cuando_el_alias_existe():
    assert traducir_citas(_tabla(), ["C2", "C1"]) == ("ch-b", "ch-a")


def test_traducir_citas_devuelve_la_marca_no_citable_cuando_el_alias_no_existe():
    assert traducir_citas(_tabla(), ["C9"]) == (CITA_NO_TRADUCIBLE,)


def test_traducir_citas_no_acepta_un_chunk_id_real_en_lugar_del_alias():
    assert traducir_citas(_tabla(), ["ch-a"]) == (CITA_NO_TRADUCIBLE,)


def test_traducir_citas_recorta_los_espacios_alrededor_del_alias():
    assert traducir_citas(_tabla(), ["  C1\n"]) == ("ch-a",)


def test_traducir_citas_no_repara_variantes_del_alias():
    assert traducir_citas(_tabla(), ["[C2]", "c2", "C 2", "C02", ""]) == (CITA_NO_TRADUCIBLE,) * 5


def test_traducir_citas_conserva_el_orden_y_las_repeticiones():
    assert traducir_citas(_tabla(), ["C3", "X", "C3"]) == ("ch-c", CITA_NO_TRADUCIBLE, "ch-c")


def test_la_marca_no_citable_no_puede_ser_un_chunk_id_del_corpus():
    assert not re.fullmatch(r"[A-Za-z0-9._@#-]+", CITA_NO_TRADUCIBLE)
