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


def test_rrf_acepta_la_constante_minima_uno():
    fusionados = _rrf(_rama(("a", 0.5)), _rama(("a", 0.5)), k=1)

    assert fusionados[0].puntaje == pytest.approx(1 / 2 + 1 / 2)


def test_rrf_rechaza_una_constante_menor_que_uno():
    with pytest.raises(ValueError):
        _rrf(_rama(("a", 0.5)), [], k=0)


PONDERADA = EstrategiaDeFusion.ponderada


def _ponderada(dense, sparse, peso: float = 0.3):
    return fusionar_candidatos(dense, sparse, PONDERADA, rrf_k=60, peso_sparse=peso)


def test_ponderada_combina_los_puntajes_normalizados_de_cada_rama_con_el_peso_sparse():
    fusionados = _ponderada(
        _rama(("a", 0.9), ("b", 0.1)), _rama(("b", 8.0), ("a", 2.0), ("c", 5.0)), peso=0.3
    )

    por_id = {c.chunk_id: c.puntaje for c in fusionados}
    assert por_id["a"] == pytest.approx(0.7 * 1.0 + 0.3 * 0.0)
    assert por_id["b"] == pytest.approx(0.7 * 0.0 + 0.3 * 1.0)
    assert por_id["c"] == pytest.approx(0.3 * 0.5)
    assert _ids(fusionados) == ["a", "b", "c"]


def test_ponderada_normaliza_cada_rama_a_cero_uno_aunque_sus_escalas_difieran():
    fusionados = _ponderada(_rama(("a", 0.5), ("b", 0.4)), _rama(("b", 1000.0), ("a", 10.0)), 0.5)

    por_id = {c.chunk_id: c.puntaje for c in fusionados}
    assert por_id["a"] == pytest.approx(0.5)
    assert por_id["b"] == pytest.approx(0.5)


def test_ponderada_da_puntaje_uno_a_la_rama_cuyos_candidatos_empatan_en_puntaje():
    fusionados = _ponderada(_rama(("a", 0.5), ("b", 0.5)), [], peso=0.3)

    assert [c.puntaje for c in fusionados] == [pytest.approx(0.7), pytest.approx(0.7)]


def test_ponderada_devuelve_el_chunk_que_solo_halla_la_rama_sparse_con_su_parte_ponderada():
    fusionados = _ponderada([], _rama(("solo-sparse", 3.0)), peso=0.3)

    assert [(c.chunk_id, c.puntaje) for c in fusionados] == [("solo-sparse", pytest.approx(0.3))]


def test_ponderada_desempata_por_chunk_id_cuando_dos_chunks_tienen_el_mismo_puntaje():
    fusionados = _ponderada(_rama(("ch-z", 0.9)), _rama(("ch-a", 4.0)), peso=0.5)

    assert _ids(fusionados) == ["ch-a", "ch-z"]


def test_ponderada_devuelve_vacio_cuando_ninguna_rama_halla_nada():
    assert _ponderada([], []) == []


@pytest.mark.parametrize("peso", [0.0, 1.0, -0.1, 1.5])
def test_ponderada_rechaza_un_peso_fuera_del_intervalo_abierto_cero_uno(peso):
    with pytest.raises(ValueError):
        _ponderada(_rama(("a", 0.5)), [], peso=peso)
