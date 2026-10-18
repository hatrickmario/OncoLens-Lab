"""Corte previo al reranker: regla pura de ``domain/candidatos`` (orden determinista)."""

from app.application.ports import ChunkEncontrado
from app.domain.candidatos import cortar_a_mejores


def _chunk(chunk_id: str, similitud: float) -> ChunkEncontrado:
    return ChunkEncontrado(
        chunk_id=chunk_id, document_id="d", chunk_text="t", similitud_dense=similitud
    )


def test_cortar_a_mejores_ordena_por_similitud_descendente_y_conserva_n():
    candidatos = [_chunk("a", 0.1), _chunk("b", 0.9), _chunk("c", 0.5)]

    assert [c.chunk_id for c in cortar_a_mejores(candidatos, 2)] == ["b", "c"]


def test_cortar_a_mejores_desempata_por_chunk_id_cuando_la_similitud_es_igual():
    candidatos = [_chunk("z", 0.5), _chunk("a", 0.5), _chunk("m", 0.5)]

    assert [c.chunk_id for c in cortar_a_mejores(candidatos, 2)] == ["a", "m"]


def test_cortar_a_mejores_devuelve_todos_cuando_n_supera_la_cantidad():
    assert len(cortar_a_mejores([_chunk("a", 0.1)], 12)) == 1
