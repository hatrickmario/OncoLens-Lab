"""`MilvusRepository.search_sparse` (US-112, D3): mismo filtro vigente que la rama dense (RN-05) y métrica del índice."""

from typing import Any

import pytest

from app.domain.retrieval_filter import expresion_solo_vigente, expresion_vigente_del_tipo
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.milvus.schema import CAMPO_SPARSE
from tests.support.milvus import ajustes_de_milvus, nombre_de_coleccion_de_test
from tests.support.recuperacion import LONGITUD_MAXIMA_DE_PRUEBA


class _ClienteMilvusEspia:
    """Borde de Milvus: registra los argumentos de ``search`` y devuelve un acierto."""

    def __init__(self) -> None:
        self.busquedas: list[dict[str, Any]] = []

    def search(self, coleccion: str, **argumentos: Any) -> list[list[dict[str, Any]]]:
        self.busquedas.append({"coleccion": coleccion, **argumentos})
        entidad = {"chunk_id": "c1", "document_id": "doc-c1", "chunk_text": "texto sintético"}
        return [[{"entity": entidad, "distance": 3.5}]]


def _repositorio(cliente: _ClienteMilvusEspia) -> MilvusRepository:
    ajustes = ajustes_de_milvus(
        "http://milvus-de-test:19530", nombre_de_coleccion_de_test("sparse")
    )
    return MilvusRepository(cliente, ajustes)  # type: ignore[arg-type]


def test_search_sparse_busca_en_el_campo_sparse_con_la_metrica_del_indice():
    cliente = _ClienteMilvusEspia()

    _repositorio(cliente).search_sparse({7: 1.0}, limit=5)

    busqueda = cliente.busquedas[0]
    assert busqueda["anns_field"] == CAMPO_SPARSE
    assert busqueda["data"] == [{7: 1.0}]
    assert busqueda["search_params"]["metric_type"] == "IP"


def test_search_sparse_envia_solo_is_current_cuando_no_se_indica_filtro():
    cliente = _ClienteMilvusEspia()

    _repositorio(cliente).search_sparse({7: 1.0}, limit=5)

    assert cliente.busquedas[0]["filter"] == expresion_solo_vigente()


def test_search_sparse_envia_el_filtro_recibido_y_devuelve_el_producto_interno_como_similitud():
    cliente = _ClienteMilvusEspia()
    filtro = expresion_vigente_del_tipo("mama", LONGITUD_MAXIMA_DE_PRUEBA)

    encontrados = _repositorio(cliente).search_sparse({7: 1.0}, limit=7, filtro=filtro)

    assert cliente.busquedas[0]["filter"] == filtro
    assert cliente.busquedas[0]["limit"] == 7
    assert [(c.chunk_id, c.similitud_sparse) for c in encontrados] == [("c1", 3.5)]


@pytest.mark.parametrize(
    "filtro", ['cancer_type_tags == "mama"', "is_current == true or source_type == x"]
)
def test_search_sparse_rechaza_el_filtro_que_no_deja_is_current_obligatorio_sin_llamar_a_milvus(
    filtro,
):
    cliente = _ClienteMilvusEspia()

    with pytest.raises(ValueError):
        _repositorio(cliente).search_sparse({7: 1.0}, limit=5, filtro=filtro)

    assert cliente.busquedas == []


def test_search_sparse_rechaza_un_vector_vacio_sin_llamar_a_milvus():
    cliente = _ClienteMilvusEspia()

    with pytest.raises(ValueError):
        _repositorio(cliente).search_sparse({}, limit=5)

    assert cliente.busquedas == []
