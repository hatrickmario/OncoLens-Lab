"""Recuento de la revisión de las preguntas (S7-D1): solo la revisión de un oncólogo valida; la de IA es mecánica."""

from __future__ import annotations

import pytest

from app.evaluation.contar_revision import RecuentoDeRevision, contar_revision


def test_cuenta_todo_como_sin_revisar_cuando_ninguna_pregunta_lleva_revision() -> None:
    assert contar_revision([False, False, False], [False, False, False]) == RecuentoDeRevision(
        0, 0, 3
    )


def test_cuenta_mecanica_verificada_cuando_solo_hay_revision_provisional() -> None:
    assert contar_revision([False] * 12, [True] * 4 + [False] * 8) == RecuentoDeRevision(0, 4, 8)


def test_cuenta_validada_y_no_mecanica_cuando_la_pregunta_tiene_ambas_revisiones() -> None:
    assert contar_revision([True, False], [True, True]) == RecuentoDeRevision(1, 1, 0)


def test_cuenta_validada_cuando_solo_la_reviso_el_oncologo() -> None:
    assert contar_revision([True], [False]) == RecuentoDeRevision(1, 0, 0)


def test_devuelve_ceros_cuando_no_hay_preguntas() -> None:
    assert contar_revision([], []) == RecuentoDeRevision(0, 0, 0)


def test_rechaza_secuencias_de_largo_distinto() -> None:
    with pytest.raises(ValueError, match="mismo largo"):
        contar_revision([True], [True, False])
