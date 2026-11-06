"""Corte previo a los pares del reranker (US-231b AC-9, decisión 82): regla pura, sin adapters."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.domain.pares_del_reranker import cortados_con_puesto, recortar_a_pares_del_reranker


@dataclass(frozen=True)
class Candidato:
    chunk_id: str
    puntaje_de_recuperacion: float


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


def test_no_hay_cortados_cuando_hay_menos_candidatos_que_pares() -> None:
    resultado = cortados_con_puesto([Candidato("a", 0.9), Candidato("b", 0.5)], 12, 50)

    assert resultado.cortados == () and resultado.omitidos == 0


def test_los_cortados_llevan_su_puesto_1_based_en_el_orden_denso() -> None:
    candidatos = [Candidato(f"c{i}", 0.1 * i) for i in range(6)]

    resultado = cortados_con_puesto(candidatos, 3, 50)

    assert resultado.cortados == (("c2", 4), ("c1", 5), ("c0", 6))


def test_un_empate_en_el_borde_se_desempata_por_chunk_id_igual_que_el_recorte() -> None:
    candidatos = [
        Candidato("z", 0.5),
        Candidato("a", 0.5),
        Candidato("m", 0.5),
        Candidato("p", 0.9),
    ]

    resultado = cortados_con_puesto(candidatos, 2, 50)

    assert resultado.cortados == (("m", 3), ("z", 4))


def test_el_tope_de_ids_lista_los_primeros_y_cuenta_los_omitidos() -> None:
    candidatos = [Candidato(f"c{i:02d}", 1.0 - 0.01 * i) for i in range(10)]

    resultado = cortados_con_puesto(candidatos, 2, 3)

    assert [c for c, _ in resultado.cortados] == ["c02", "c03", "c04"] and resultado.omitidos == 5


@pytest.mark.parametrize("pares, ids", [(0, 5), (5, 0)])
def test_rechaza_topes_no_positivos(pares: int, ids: int) -> None:
    with pytest.raises(ValueError):
        cortados_con_puesto([Candidato("a", 0.5)], pares, ids)


def test_el_tope_de_ids_por_defecto_coincide_en_settings_y_en_el_servicio() -> None:
    from app.application.rag_orchestrator_service import ParametrosDeRecuperacion
    from app.config.settings import Settings

    por_defecto = ParametrosDeRecuperacion.__dataclass_fields__["reranker_cut_log_max_ids"].default
    assert Settings().reranker_cut_log_max_ids == por_defecto  # type: ignore[call-arg]
