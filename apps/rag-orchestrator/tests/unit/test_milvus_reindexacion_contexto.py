"""``MilvusRepository`` en la reindexación de contexto (US-279 D4): lectura paginada de TODOS los chunks, ids presentes y filas completas."""

from __future__ import annotations

from typing import Any

import pytest

from app.infrastructure.milvus.repository import (
    LIMITE_DE_CONSULTA,
    ConsultaTruncada,
    MilvusRepository,
)
from tests.support.milvus import ajustes_de_milvus, nombre_de_coleccion_de_test


def _fila(indice: int, *, vigente: bool = True) -> dict[str, Any]:
    return {
        "chunk_id": f"d@1#{indice:04d}",
        "document_id": "d@1",
        "dense_vector": [0.5] * 8,
        "sparse_vector": {1: 0.5},
        "chunk_text": f"texto {indice}",
        "chunk_index": indice,
        "section": "texto_completo",
        "is_current": vigente,
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
    """Borde de Milvus: registra ``query_iterator``, ``query`` y ``upsert``."""

    def __init__(
        self, paginas: list[list[dict[str, Any]]] | None = None, filas: list[dict[str, Any]] = ()
    ) -> None:
        self.iterador = _IteradorFalso(paginas or [])
        self.filas = list(filas)
        self.consultas: list[dict[str, Any]] = []
        self.query_simples: list[dict[str, Any]] = []
        self.upserts: list[tuple[str, list[dict[str, Any]]]] = []

    def query_iterator(self, coleccion: str, **argumentos: Any) -> _IteradorFalso:
        self.consultas.append({"coleccion": coleccion, **argumentos})
        return self.iterador

    def query(self, coleccion: str, **argumentos: Any) -> list[dict[str, Any]]:
        self.query_simples.append({"coleccion": coleccion, **argumentos})
        return self.filas

    def upsert(self, coleccion: str, filas: list[dict[str, Any]]) -> dict[str, int]:
        self.upserts.append((coleccion, filas))
        return {"upsert_count": len(filas)}


def _repositorio(cliente: _ClienteMilvusEspia) -> MilvusRepository:
    ajustes = ajustes_de_milvus("http://milvus-de-test:19530", nombre_de_coleccion_de_test("ctx"))
    return MilvusRepository(cliente, ajustes)  # type: ignore[arg-type]


@pytest.mark.parametrize("lote", [0, -1, LIMITE_DE_CONSULTA, LIMITE_DE_CONSULTA + 1])
def test_rechaza_un_lote_fuera_de_0_a_limite_de_consulta_sin_leer_nada(lote: int) -> None:
    cliente = _ClienteMilvusEspia()

    with pytest.raises(ValueError):
        _repositorio(cliente).listar_paginado(lote)

    assert cliente.consultas == []


def test_lee_todos_los_chunks_vigentes_o_no_con_todos_los_campos_y_consistencia_fuerte() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0)]])

    list(_repositorio(cliente).listar_paginado(2))

    consulta = cliente.consultas[0]
    assert consulta["filter"] == 'chunk_id != ""'
    assert consulta["output_fields"] == ["*"] and consulta["consistency_level"] == "Strong"
    assert consulta["batch_size"] == 2


def test_entrega_cada_pagina_con_los_campos_de_decision_y_el_registro_completo_y_cierra_el_iterador() -> (
    None
):
    cliente = _ClienteMilvusEspia([[_fila(0), _fila(1, vigente=False)], [_fila(2)]])

    paginas = list(_repositorio(cliente).listar_paginado(2))

    assert [[c.chunk_id for c in p] for p in paginas] == [["d@1#0000", "d@1#0001"], ["d@1#0002"]]
    primero, segundo = paginas[0]
    assert (primero.document_id, primero.chunk_index, primero.section) == (
        "d@1",
        0,
        "texto_completo",
    )
    assert primero.chunk_text == "texto 0" and primero.is_current and not segundo.is_current
    assert dict(segundo.registro) == _fila(1, vigente=False)
    assert cliente.iterador.cerrado


def test_cierra_el_iterador_aunque_el_consumidor_abandone_la_lectura() -> None:
    cliente = _ClienteMilvusEspia([[_fila(0)], [_fila(1)]])

    paginas = _repositorio(cliente).listar_paginado(1)
    next(paginas)
    paginas.close()

    assert cliente.iterador.cerrado


def test_ids_presentes_pregunta_por_esos_ids_y_devuelve_los_que_existen() -> None:
    cliente = _ClienteMilvusEspia(filas=[{"chunk_id": "d@1#0001"}])

    presentes = _repositorio(cliente).ids_presentes(["d@1#0000", "d@1#0001"])

    assert presentes == frozenset({"d@1#0001"})
    consulta = cliente.query_simples[0]
    assert consulta["filter"] == 'chunk_id in ["d@1#0000", "d@1#0001"]'
    assert consulta["output_fields"] == ["chunk_id"] and consulta["consistency_level"] == "Strong"


def test_ids_presentes_sin_ids_no_llama_a_milvus() -> None:
    cliente = _ClienteMilvusEspia()

    assert _repositorio(cliente).ids_presentes([]) == frozenset()
    assert cliente.query_simples == []


def test_ids_presentes_rechaza_un_id_con_comillas() -> None:
    with pytest.raises(ValueError):
        _repositorio(_ClienteMilvusEspia()).ids_presentes(['d@1"#0000'])


def test_ids_presentes_falla_si_la_consulta_alcanza_el_tope_de_milvus() -> None:
    cliente = _ClienteMilvusEspia(filas=[{"chunk_id": "x"}] * LIMITE_DE_CONSULTA)

    with pytest.raises(ConsultaTruncada):
        _repositorio(cliente).ids_presentes(["x"])


def test_escribir_filas_hace_upsert_de_las_filas_completas_en_la_coleccion_propia() -> None:
    cliente = _ClienteMilvusEspia()
    repositorio = _repositorio(cliente)

    escritas = repositorio.escribir_filas([_fila(0), _fila(1, vigente=False)])

    assert escritas == 2
    ((coleccion, filas),) = cliente.upserts
    assert coleccion == nombre_de_coleccion_de_test("ctx")
    assert filas == [_fila(0), _fila(1, vigente=False)]


def test_escribir_sin_filas_no_llama_a_milvus() -> None:
    cliente = _ClienteMilvusEspia()

    assert _repositorio(cliente).escribir_filas([]) == 0
    assert cliente.upserts == []
