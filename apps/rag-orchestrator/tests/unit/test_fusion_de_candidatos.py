"""Fusión de las ramas dense y sparse (US-112, D2): regla pura de dominio, sin adapters."""

import pytest

from app.domain.fusion_de_candidatos import (
    CandidatoDeRama,
    EstrategiaDeFusion,
    fusionar_candidatos,
)

RRF = EstrategiaDeFusion.rrf


def _rama(*pares: tuple[str, float]) -> list[CandidatoDeRama]:
    return [CandidatoDeRama(chunk_id, puntaje) for chunk_id, puntaje in pares]


def _ids(fusionados) -> list[str]:
    return [c.chunk_id for c in fusionados]


def _rrf(dense, sparse, k: int = 60):
    return fusionar_candidatos(dense, sparse, RRF, rrf_k=k, peso_sparse=0.3)


def test_rrf_suma_uno_sobre_k_mas_el_rango_de_cada_rama():
    fusionados = _rrf(_rama(("a", 0.9), ("b", 0.5)), _rama(("b", 7.0), ("a", 2.0)))

    por_id = {c.chunk_id: c.puntaje for c in fusionados}
    assert por_id["a"] == pytest.approx(1 / 61 + 1 / 62)
    assert por_id["b"] == pytest.approx(1 / 62 + 1 / 61)


def test_rrf_pone_primero_al_chunk_presente_en_las_dos_ramas():
    fusionados = _rrf(_rama(("solo-dense", 0.9), ("ambos", 0.8)), _rama(("ambos", 5.0)))

    assert _ids(fusionados)[0] == "ambos"


def test_rrf_conserva_el_orden_de_la_rama_dense_cuando_la_sparse_esta_vacia():
    fusionados = _rrf(_rama(("a", 0.5), ("b", 0.9), ("c", 0.7)), [])

    assert _ids(fusionados) == ["b", "c", "a"]


def test_rrf_devuelve_el_chunk_que_solo_halla_la_rama_sparse():
    fusionados = _rrf([], _rama(("solo-sparse", 3.0)))

    assert _ids(fusionados) == ["solo-sparse"]


def test_rrf_devuelve_vacio_cuando_ninguna_rama_halla_nada():
    assert _rrf([], []) == []


def test_rrf_desempata_por_chunk_id_cuando_dos_chunks_tienen_el_mismo_puntaje():
    fusionados = _rrf(_rama(("ch-z", 0.9)), _rama(("ch-a", 4.0)))

    assert _ids(fusionados) == ["ch-a", "ch-z"]


def test_rrf_ordena_cada_rama_por_su_puntaje_aunque_llegue_desordenada():
    desordenada = _rrf(_rama(("a", 0.1), ("b", 0.9)), [])
    ordenada = _rrf(_rama(("b", 0.9), ("a", 0.1)), [])

    assert desordenada == ordenada


def test_rrf_desempata_el_rango_dentro_de_una_rama_por_chunk_id():
    fusionados = _rrf(_rama(("b", 0.5), ("a", 0.5)), [])

    assert _ids(fusionados) == ["a", "b"]


def test_rrf_rechaza_una_constante_menor_que_uno():
    with pytest.raises(ValueError):
        _rrf(_rama(("a", 0.5)), [], k=0)
