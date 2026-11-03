"""Unitarios de las reglas puras del orden de RN-28 sobre las opciones mostradas (US-140 AC-1…AC-3)."""

from __future__ import annotations

from app.evaluation.metricas.orden_opciones import (
    OpcionOrdenable,
    ids_con_orden_violado,
    ids_no_comparables_antes_de_una_comparable,
    no_comparable_al_final,
    orden_conforme_rn28,
)


def opcion(
    identificador: str,
    *,
    excluyentes: int = 0,
    coincide: int = 2,
    relevancia: float = 0.5,
    no_comparable: bool = False,
) -> OpcionOrdenable:
    return OpcionOrdenable(identificador, excluyentes, coincide, relevancia, no_comparable)


def test_orden_conforme_es_verdadero_cuando_no_hay_opciones() -> None:
    assert orden_conforme_rn28(())


def test_orden_conforme_es_verdadero_cuando_una_sola_opcion() -> None:
    assert orden_conforme_rn28((opcion("o1", excluyentes=1),))


def test_orden_conforme_es_falso_cuando_una_opcion_con_mas_excluyentes_precede_a_otra() -> None:
    opciones = (opcion("o1", excluyentes=1, coincide=3), opcion("o2", excluyentes=0, coincide=0))

    assert not orden_conforme_rn28(opciones)
    assert ids_con_orden_violado(opciones) == ("o1",)


def test_orden_conforme_es_falso_cuando_con_los_mismos_excluyentes_una_con_menos_coincide_precede() -> (
    None
):
    assert not orden_conforme_rn28((opcion("o1", coincide=1), opcion("o2", coincide=2)))


def test_orden_conforme_es_falso_cuando_con_los_mismos_conteos_una_de_menor_relevancia_precede() -> (
    None
):
    assert not orden_conforme_rn28((opcion("o1", relevancia=0.4), opcion("o2", relevancia=0.9)))


def test_orden_conforme_es_verdadero_cuando_los_conteos_y_la_relevancia_empatan() -> None:
    """El desempate final (``chunkId``) no viaja en la respuesta: un empate total no es una violación."""
    assert orden_conforme_rn28((opcion("o1"), opcion("o2")))


def test_orden_conforme_es_verdadero_cuando_la_relevancia_solo_desempata_y_los_conteos_mandan() -> (
    None
):
    opciones = (opcion("o1", coincide=3, relevancia=0.1), opcion("o2", coincide=2, relevancia=0.9))

    assert orden_conforme_rn28(opciones)


def test_no_comparable_al_final_es_verdadero_cuando_la_no_comparable_es_la_ultima() -> None:
    assert no_comparable_al_final((opcion("o1"), opcion("o2", no_comparable=True)))


def test_no_comparable_al_final_es_verdadero_cuando_todas_son_no_comparables() -> None:
    assert no_comparable_al_final(
        (opcion("o1", no_comparable=True), opcion("o2", no_comparable=True))
    )


def test_no_comparable_al_final_es_falso_cuando_precede_a_una_comparable() -> None:
    opciones = (opcion("o1", no_comparable=True), opcion("o2"), opcion("o3", no_comparable=True))

    assert not no_comparable_al_final(opciones)
    assert ids_no_comparables_antes_de_una_comparable(opciones) == ("o1",)
