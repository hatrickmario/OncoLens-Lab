"""Regla por papel de las afirmaciones atómicas (RN-01, US-245, D-a): pura, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.claims import PapelDeAfirmacion
from app.domain.soporte_por_papel import (
    EstadoDeAfirmacion,
    MotivoDeSoporte,
    decidir_opcion_por_papel,
    es_causa_de_descarte,
)

P, S, V = PapelDeAfirmacion.principal, PapelDeAfirmacion.secundaria, PapelDeAfirmacion.salvedad
OK = EstadoDeAfirmacion.soportada
SIN = EstadoDeAfirmacion.sin_soporte
FORMA = EstadoDeAfirmacion.fuera_de_forma
MODAL = EstadoDeAfirmacion.modal_normativo
LENGUAJE = EstadoDeAfirmacion.lenguaje_no_permitido


def test_conserva_la_opcion_sin_omitir_nada_cuando_todas_las_afirmaciones_se_soportan() -> None:
    decision = decidir_opcion_por_papel([(P, OK), (S, OK), (V, OK)])

    assert decision.conservar and decision.motivo is None and decision.omitidas == ()


def test_omite_la_secundaria_sin_soporte_y_conserva_la_opcion() -> None:
    decision = decidir_opcion_por_papel([(P, OK), (S, SIN), (V, OK)])

    assert decision.conservar and decision.omitidas == (1,)


def test_omite_la_secundaria_fuera_de_forma_por_alias_o_longitud_y_conserva_la_opcion() -> None:
    decision = decidir_opcion_por_papel([(P, OK), (S, FORMA)])

    assert decision.conservar and decision.omitidas == (1,)


@pytest.mark.parametrize("papel", [P, V])
@pytest.mark.parametrize("estado", [SIN, FORMA])
def test_descarta_con_afirmacion_sin_soporte_cuando_la_principal_o_la_salvedad_no_se_respalda(
    papel: PapelDeAfirmacion, estado: EstadoDeAfirmacion
) -> None:
    estados = [(P, OK), (S, OK), (V, OK)]
    estados = [(p, estado if p is papel else e) for p, e in estados]

    decision = decidir_opcion_por_papel(estados)

    assert not decision.conservar and decision.motivo is MotivoDeSoporte.afirmacion_sin_soporte


@pytest.mark.parametrize("papel", [P, S, V])
def test_descarta_con_afirmacion_sin_soporte_cuando_cualquier_papel_trae_modal_normativo(
    papel: PapelDeAfirmacion,
) -> None:
    estados = [(P, OK), (S, OK), (V, OK)]
    estados = [(p, MODAL if p is papel else e) for p, e in estados]

    decision = decidir_opcion_por_papel(estados)

    assert not decision.conservar and decision.motivo is MotivoDeSoporte.afirmacion_sin_soporte


@pytest.mark.parametrize("papel", [P, S, V])
def test_descarta_con_lenguaje_no_permitido_cuando_cualquier_papel_incumple_la_lista(
    papel: PapelDeAfirmacion,
) -> None:
    estados = [(P, OK), (S, OK), (V, OK)]
    estados = [(p, LENGUAJE if p is papel else e) for p, e in estados]

    decision = decidir_opcion_por_papel(estados)

    assert not decision.conservar and decision.motivo is MotivoDeSoporte.lenguaje_no_permitido


def test_el_lenguaje_no_permitido_precede_al_modal_y_a_la_falta_de_soporte() -> None:
    decision = decidir_opcion_por_papel([(P, SIN), (S, MODAL), (V, LENGUAJE)])

    assert decision.motivo is MotivoDeSoporte.lenguaje_no_permitido


def test_el_modal_normativo_precede_a_la_falta_de_soporte() -> None:
    decision = decidir_opcion_por_papel([(P, SIN), (S, MODAL)])

    assert decision.motivo is MotivoDeSoporte.afirmacion_sin_soporte
    assert not decision.conservar


def test_descarta_con_lenguaje_no_permitido_cuando_el_propio_texto_de_la_opcion_incumple_la_lista() -> (
    None
):
    decision = decidir_opcion_por_papel([(P, OK)], option_incumple=True)

    assert not decision.conservar and decision.motivo is MotivoDeSoporte.lenguaje_no_permitido


@pytest.mark.parametrize("papel", list(PapelDeAfirmacion))
@pytest.mark.parametrize("estado", list(EstadoDeAfirmacion))
def test_es_causa_de_descarte_coincide_con_la_decision_de_la_opcion_en_toda_la_matriz_papel_por_estado(
    papel: PapelDeAfirmacion, estado: EstadoDeAfirmacion
) -> None:
    estados = [(P, estado)] if papel is P else [(P, OK), (papel, estado)]

    decision = decidir_opcion_por_papel(estados)

    assert es_causa_de_descarte(papel, estado) is (not decision.conservar)
