"""``MilvusRepository.posiciones`` (L1D-322): lugar de un chunk vigente dentro de su documento, con un cliente falso."""

from __future__ import annotations

import re
from typing import Any

import pytest

from app.application.ports import PosicionDeChunk
from app.infrastructure.milvus.repository import (
    LIMITE_DE_CONSULTA,
    ConsultaTruncada,
    MilvusRepository,
)
from tests.support.milvus import ajustes_de_milvus

FILAS = [
    {"chunk_id": "d1-c", "document_id": "d1", "chunk_index": 2, "is_current": True},
    {"chunk_id": "d1-a", "document_id": "d1", "chunk_index": 0, "is_current": True},
    {"chunk_id": "d1-b", "document_id": "d1", "chunk_index": 1, "is_current": False},
    {"chunk_id": "d2-a", "document_id": "d2", "chunk_index": 0, "is_current": True},
]


class ClienteConFilas:
    """``query`` entiende solo los filtros ``<campo> in [...] and is_current == true`` que emite el repositorio."""

    def __init__(self, filas: list[dict[str, Any]]) -> None:
        self._filas = filas
        self.filtros: list[str] = []

    def query(self, _coleccion: str, *, filter: str, **__: Any) -> list[dict[str, Any]]:
        self.filtros.append(filter)
        campo = filter.split(" ", 1)[0]
        valores = set(re.findall(r'"([^"]*)"', filter))
        return [f for f in self._filas if f["is_current"] and f[campo] in valores]


def _repositorio(cliente: ClienteConFilas) -> MilvusRepository:
    return MilvusRepository(cliente, ajustes_de_milvus("http://x", "corpus_test_unitario"))  # type: ignore[arg-type]


def test_posiciones_cuenta_desde_1_por_chunk_index_entre_los_vigentes_del_documento():
    posiciones = _repositorio(ClienteConFilas(FILAS)).posiciones({"d1-a", "d1-c", "d2-a"})

    assert posiciones == {
        "d1-a": PosicionDeChunk("d1", 1, 2),
        "d1-c": PosicionDeChunk("d1", 2, 2),
        "d2-a": PosicionDeChunk("d2", 1, 1),
    }


def test_posiciones_omite_el_chunk_que_no_esta_vigente_o_no_existe():
    posiciones = _repositorio(ClienteConFilas(FILAS)).posiciones({"d1-b", "no-existe"})

    assert posiciones == {}


def test_posiciones_no_consulta_nada_cuando_no_se_piden_chunks():
    cliente = ClienteConFilas(FILAS)

    assert _repositorio(cliente).posiciones(set()) == {}
    assert cliente.filtros == []


def test_posiciones_exige_el_filtro_de_vigentes_en_las_dos_consultas():
    cliente = ClienteConFilas(FILAS)

    _repositorio(cliente).posiciones({"d1-a"})

    assert len(cliente.filtros) == 2
    assert all(f.endswith("and is_current == true") for f in cliente.filtros)


def test_posiciones_rechaza_un_id_con_comillas_cuando_podria_alterar_el_filtro():
    with pytest.raises(ValueError):
        _repositorio(ClienteConFilas(FILAS)).posiciones(
            {'x" or is_current == false or chunk_id == "'}
        )


def test_posiciones_no_actua_con_un_resultado_truncado_por_el_tope_de_milvus():
    filas = [
        {"chunk_id": f"c{i}", "document_id": "d", "chunk_index": i, "is_current": True}
        for i in range(LIMITE_DE_CONSULTA)
    ]

    with pytest.raises(ConsultaTruncada):
        _repositorio(ClienteConFilas(filas)).posiciones({"c0"})
