"""Orden determinista de chunks por relevancia (RN-03): una sola fuente para el servicio y para los alias (US-236)."""

from app.domain.alias_de_chunks import asignar_alias
from app.domain.relevance import ChunkPuntuado, ordenar_por_relevancia


def _chunk(chunk_id: str, puntaje: float) -> ChunkPuntuado:
    return ChunkPuntuado(chunk_id, "doc", f"texto de {chunk_id}", puntaje)


def test_ordenar_por_relevancia_devuelve_lista_vacia_cuando_no_hay_chunks():
    assert ordenar_por_relevancia([]) == []


def test_ordenar_por_relevancia_pone_primero_el_mayor_puntaje():
    chunks = [_chunk("a", 0.2), _chunk("b", 0.9), _chunk("c", 0.5)]

    assert [c.chunk_id for c in ordenar_por_relevancia(chunks)] == ["b", "c", "a"]


def test_ordenar_por_relevancia_desempata_por_chunk_id_ascendente():
    chunks = [_chunk("z", 0.5), _chunk("a", 0.5), _chunk("m", 0.5)]

    assert [c.chunk_id for c in ordenar_por_relevancia(chunks)] == ["a", "m", "z"]


def test_ordenar_por_relevancia_no_modifica_la_entrada():
    chunks = [_chunk("b", 0.1), _chunk("a", 0.9)]

    ordenar_por_relevancia(chunks)

    assert [c.chunk_id for c in chunks] == ["b", "a"]


def test_asignar_alias_sigue_el_mismo_orden_que_ordenar_por_relevancia():
    chunks = [_chunk("z", 0.5), _chunk("a", 0.5), _chunk("m", 0.9), _chunk("k", 0.1)]

    ordenados = [c.chunk_id for c in ordenar_por_relevancia(chunks)]

    assert [f.chunk.chunk_id for f in asignar_alias(chunks).fragmentos] == ordenados
