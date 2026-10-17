"""`MilvusRepository.search_dense` envía a Milvus la expresión de filtro vigente (RN-05, US-055 AC-3/AC-4)."""

from typing import Any

import pytest

from app.domain.retrieval_filter import expresion_solo_vigente, expresion_vigente_del_tipo
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.recuperacion import LONGITUD_MAXIMA_DE_PRUEBA
from tests.support.milvus import ajustes_de_milvus, nombre_de_coleccion_de_test


class _ClienteMilvusEspia:
    """Borde de Milvus: registra los argumentos de ``search`` y devuelve un resultado de un chunk."""

    def __init__(self) -> None:
        self.busquedas: list[dict[str, Any]] = []

    def search(self, coleccion: str, **argumentos: Any) -> list[list[dict[str, Any]]]:
        self.busquedas.append({"coleccion": coleccion, **argumentos})
        entidad = {"chunk_id": "c1", "document_id": "doc-c1", "chunk_text": "texto sintético"}
        return [[{"entity": entidad, "distance": 0.5}]]


def _repositorio(cliente: _ClienteMilvusEspia) -> MilvusRepository:
    ajustes = ajustes_de_milvus(
        "http://milvus-de-test:19530", nombre_de_coleccion_de_test("filtro")
    )
    return MilvusRepository(cliente, ajustes)  # type: ignore[arg-type]


def test_search_dense_envia_solo_is_current_cuando_no_se_indica_filtro():
    cliente = _ClienteMilvusEspia()

    _repositorio(cliente).search_dense([0.0] * 8, limit=5)

    assert cliente.busquedas[0]["filter"] == expresion_solo_vigente()


def test_search_dense_envia_el_filtro_recibido_cuando_exige_is_current():
    cliente = _ClienteMilvusEspia()
    filtro = expresion_vigente_del_tipo("mama", LONGITUD_MAXIMA_DE_PRUEBA)

    encontrados = _repositorio(cliente).search_dense([0.0] * 8, limit=7, filtro=filtro)

    assert cliente.busquedas[0]["filter"] == filtro
    assert cliente.busquedas[0]["limit"] == 7
    assert [c.chunk_id for c in encontrados] == ["c1"]


@pytest.mark.parametrize(
    "filtro",
    [
        'cancer_type_tags == "mama"',
        "is_current == true or source_type == x",
        "is_current == true and (a) or (b)",
    ],
)
def test_search_dense_rechaza_el_filtro_que_no_deja_is_current_obligatorio_sin_llamar_a_milvus(
    filtro,
):
    cliente = _ClienteMilvusEspia()

    with pytest.raises(ValueError):
        _repositorio(cliente).search_dense([0.0] * 8, limit=5, filtro=filtro)

    assert cliente.busquedas == []
