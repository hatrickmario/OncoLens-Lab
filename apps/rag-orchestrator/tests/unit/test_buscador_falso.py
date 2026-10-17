"""El fake de la búsqueda cumple el mismo contrato que `MilvusRepository`: sin `is_current` obligatorio, `ValueError`."""

import pytest

from app.domain.retrieval_filter import expresion_vigente_del_tipo
from tests.support.recuperacion import BuscadorFalso

VECTOR = [1.0] + [0.0] * 7


def test_buscador_falso_rechaza_el_filtro_sin_is_current_obligatorio():
    with pytest.raises(ValueError):
        BuscadorFalso().search_dense(VECTOR, 10, 'cancer_type_tags == "mama"')


def test_buscador_falso_no_devuelve_chunks_cuyo_tipo_solo_es_subcadena_de_otra_etiqueta():
    assert BuscadorFalso().search_dense(VECTOR, 10, expresion_vigente_del_tipo("ta")) == []
