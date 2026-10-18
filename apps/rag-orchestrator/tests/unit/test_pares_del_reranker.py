"""Corte previo a los pares del reranker (US-231b AC-9, decisión 82): regla pura, sin adapters."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.domain.pares_del_reranker import recortar_a_pares_del_reranker


@dataclass(frozen=True)
class Candidato:
    chunk_id: str
    similitud_dense: float


def _ids(candidatos: list[Candidato]) -> list[str]:
    return [c.chunk_id for c in candidatos]


def test_con_menos_candidatos_que_pares_no_se_descarta_ninguno() -> None:
    candidatos = [Candidato("b", 0.5), Candidato("a", 0.9)]

    assert _ids(recortar_a_pares_del_reranker(candidatos, 12)) == ["a", "b"]


def test_conserva_los_mejores_por_similitud_cuando_hay_mas_candidatos_que_pares() -> None:
    candidatos = [Candidato(f"c{i}", 0.1 * i) for i in range(6)]

    assert _ids(recortar_a_pares_del_reranker(candidatos, 3)) == ["c5", "c4", "c3"]


def test_un_empate_en_el_borde_se_resuelve_por_chunk_id() -> None:
    candidatos = [
        Candidato("z", 0.5),
        Candidato("a", 0.5),
        Candidato("m", 0.5),
        Candidato("p", 0.9),
    ]

    assert _ids(recortar_a_pares_del_reranker(candidatos, 2)) == ["p", "a"]


def test_el_resultado_no_depende_del_orden_de_entrada() -> None:
    candidatos = [
        Candidato("z", 0.5),
        Candidato("a", 0.5),
        Candidato("m", 0.7),
        Candidato("p", 0.9),
    ]

    assert recortar_a_pares_del_reranker(candidatos, 3) == recortar_a_pares_del_reranker(
        list(reversed(candidatos)), 3
    )


def test_no_modifica_la_secuencia_recibida() -> None:
    candidatos = [Candidato("b", 0.1), Candidato("a", 0.9)]

    recortar_a_pares_del_reranker(candidatos, 1)

    assert _ids(candidatos) == ["b", "a"]


def test_una_lista_vacia_devuelve_vacia() -> None:
    assert recortar_a_pares_del_reranker([], 12) == []


@pytest.mark.parametrize("maximo", [0, -1])
def test_un_maximo_de_pares_no_positivo_se_rechaza(maximo: int) -> None:
    with pytest.raises(ValueError):
        recortar_a_pares_del_reranker([Candidato("a", 0.5)], maximo)
