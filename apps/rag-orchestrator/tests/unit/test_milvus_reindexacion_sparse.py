"""``MilvusRepository`` en la reindexación *sparse* (US-117b D2/D4): páginas por ``query_iterator``, borde del lote y reescritura."""

from __future__ import annotations

from typing import Any

import pytest

from app.domain.retrieval_filter import expresion_solo_vigente
from app.infrastructure.milvus.repository import LIMITE_DE_CONSULTA, MilvusRepository
from tests.support.milvus import ajustes_de_milvus, nombre_de_coleccion_de_test


def _fila(indice: int) -> dict[str, Any]:
    return {
        "chunk_id": f"d@1#{indice:04d}",
        "document_id": "d@1",
        "dense_vector": [0.5] * 8,
        "sparse_vector": {},
        "chunk_text": f"texto {indice}",
        "is_current": True,
    }


class _IteradorFalso:
    def __init__(self, paginas: list[list[dict[str, Any]]]) -> None:
        self._paginas = list(paginas)
        self.cerrado = False

    def next(self) -> list[dict[str, Any]]:
        return self._paginas.pop(0) if self._paginas else []

    def close(self) -> None:
        self.cerrado = True


class _ClienteMilvusEspia:
    """Borde de Milvus: registra ``query_iterator`` y ``upsert``."""

    def __init__(self, paginas: list[list[dict[str, Any]]] | None = None) -> None:
        self.iterador = _IteradorFalso(paginas or [])
        self.consultas: list[dict[str, Any]] = []
        self.upserts: list[list[dict[str, Any]]] = []

    def query_iterator(self, coleccion: str, **argumentos: Any) -> _IteradorFalso:
        self.consultas.append({"coleccion": coleccion, **argumentos})
        return self.iterador

    def upsert(self, coleccion: str, filas: list[dict[str, Any]]) -> dict[str, int]:
        self.upserts.append(filas)
        return {"upsert_count": len(filas)}


def _repositorio(cliente: _ClienteMilvusEspia) -> MilvusRepository:
    ajustes = ajustes_de_milvus(
        "http://milvus-de-test:19530", nombre_de_coleccion_de_test("reindex")
    )
    return MilvusRepository(cliente, ajustes)  # type: ignore[arg-type]


@pytest.mark.parametrize("lote", [0, -1, LIMITE_DE_CONSULTA, LIMITE_DE_CONSULTA + 1])
def test_rechaza_un_lote_fuera_de_0_a_limite_de_consulta_sin_leer_nada(lote: int) -> None:
    cliente = _ClienteMilvusEspia()

    with pytest.raises(ValueError):
        _repositorio(cliente).listar_vigentes_paginado(lote)

    assert cliente.consultas == []


def test_acepta_el_lote_inmediatamente_por_debajo_del_limite_de_consulta() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0)]])

    paginas = list(_repositorio(cliente).listar_vigentes_paginado(LIMITE_DE_CONSULTA - 1))

    assert len(paginas) == 1 and cliente.consultas[0]["batch_size"] == LIMITE_DE_CONSULTA - 1


def test_lee_solo_los_vigentes_con_todos_los_campos_y_consistencia_fuerte() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0)]])

    list(_repositorio(cliente).listar_vigentes_paginado(2))

    consulta = cliente.consultas[0]
    assert consulta["filter"] == expresion_solo_vigente()
    assert consulta["output_fields"] == ["*"] and consulta["consistency_level"] == "Strong"


def test_entrega_cada_pagina_con_el_texto_y_el_registro_completo_y_cierra_el_iterador() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0), _fila(1)], [_fila(2)]])

    paginas = list(_repositorio(cliente).listar_vigentes_paginado(2))

    assert [[c.chunk_id for c in p] for p in paginas] == [["d@1#0000", "d@1#0001"], ["d@1#0002"]]
    assert paginas[0][1].chunk_text == "texto 1" and dict(paginas[0][1].registro) == _fila(1)
    assert cliente.iterador.cerrado


def test_cierra_el_iterador_aunque_el_consumidor_abandone_la_lectura() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0)], [_fila(1)]])

    paginas = _repositorio(cliente).listar_vigentes_paginado(1)
    next(paginas)
    paginas.close()

    assert cliente.iterador.cerrado


def test_reescribe_cada_fila_leida_con_solo_el_sparse_cambiado() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0), _fila(1)]])
    repositorio = _repositorio(cliente)
    (pagina,) = repositorio.listar_vigentes_paginado(2)

    escritos = repositorio.reescribir_sparse(pagina, [{1: 0.5}, {2: 0.25}])

    assert escritos == 2
    assert cliente.upserts == [
        [{**_fila(0), "sparse_vector": {1: 0.5}}, {**_fila(1), "sparse_vector": {2: 0.25}}]
    ]


def test_reescribir_sin_chunks_no_llama_a_milvus() -> None:
    cliente = _ClienteMilvusEspia()

    assert _repositorio(cliente).reescribir_sparse([], []) == 0
    assert cliente.upserts == []
