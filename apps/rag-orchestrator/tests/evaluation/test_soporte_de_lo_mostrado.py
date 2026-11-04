"""M-10.1 juzga el soporte de lo que la opción MUESTRA, no de lo que el servicio omitió (D5-28, RN-01).

El recálculo sigue siendo independiente del servicio: parte del plan de la propuesta cruda y del NLI, y solo se limita a
las afirmaciones cuyo texto figura en ``rationale`` o ``details`` de la opción mostrada.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

import pytest

from app.domain.atribucion import MARCO_ES, FormaDeAfirmacion
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import PapelDeAfirmacion
from app.domain.support import Afirmacion, AfirmacionPorPapel, OpcionPlanificada
from app.evaluation.corrida_opciones import tiene_soporte
from app.evaluation.metricas.opciones_mostradas import (
    AnalisisDeOpciones,
    OpcionMostrada,
    violaciones_de,
)
from app.evaluation.metricas.orden_opciones import OpcionOrdenable

PRINCIPAL = "la quimioterapia adyuvante mejoró la supervivencia libre de enfermedad"
SECUNDARIA = "el beneficio fue mayor en tumores con receptores hormonales negativos"


class JuezPorTexto:
    """NLI falso: implica solo las afirmaciones cuyo texto se le declaró."""

    def __init__(self, *implicadas: str) -> None:
        self.implicadas = set(implicadas)

    async def juzgar_soporte(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        return afirmacion in self.implicadas


def afirmacion(texto: str, papel: PapelDeAfirmacion) -> AfirmacionPorPapel:
    campo = "rationale" if papel is PapelDeAfirmacion.principal else "details"
    return AfirmacionPorPapel(
        texto, campo, (), ("premisa del chunk citado",), papel, FormaDeAfirmacion.valida
    )


def con_principal_y_secundaria() -> OpcionPlanificada:
    generada = OpcionGenerada("Quimioterapia adyuvante", "", ("c1",))
    return OpcionPlanificada(
        OpcionAceptada(generada, ("c1",)),
        Afirmacion("Quimioterapia adyuvante", "option", (), ()),
        (
            afirmacion(PRINCIPAL, PapelDeAfirmacion.principal),
            afirmacion(SECUNDARIA, PapelDeAfirmacion.secundaria),
        ),
    )


def analisis_con(soporte: bool) -> AnalisisDeOpciones:
    opcion = OpcionMostrada(
        "o1", ("doc-a1",), True, soporte, OpcionOrdenable("o1", 0, 2, 1.0, False)
    )
    return AnalisisDeOpciones("OP-04", False, (opcion,), ("doc-a1",), False, 0, 0, ())


def soporte_de(juez: JuezPorTexto, rationale: str, detalles: tuple[str, ...]) -> bool:
    return asyncio.run(tiene_soporte(juez, con_principal_y_secundaria(), rationale, detalles))


@pytest.mark.ac("US-140", 1)
def test_m_10_1_no_se_viola_cuando_la_secundaria_sin_soporte_se_omitio_y_no_se_muestra() -> None:
    """Una opción con una secundaria que el NLI no implica se muestra solo con su principal (omittedClaims=1):
    M-10.1 no se viola [US-140 AC-M-10.1]."""
    juez = JuezPorTexto(PRINCIPAL)  # la secundaria NO se implica y el servicio la omitió

    soporte = soporte_de(juez, MARCO_ES + PRINCIPAL, ())

    violaciones = violaciones_de(analisis_con(soporte))
    assert [v for v in violaciones if v.invariante == "M-10.1"] == []


def test_m_10_1_sigue_violada_cuando_se_muestra_una_afirmacion_sin_soporte() -> None:
    juez = JuezPorTexto(
        PRINCIPAL
    )  # la secundaria no se implica, pero el servicio la dejó en details

    soporte = soporte_de(juez, MARCO_ES + PRINCIPAL, (MARCO_ES + SECUNDARIA,))

    assert soporte is False
    assert [v.invariante for v in violaciones_de(analisis_con(soporte))] == ["M-10.1"]


def test_tiene_soporte_cuando_la_principal_y_la_secundaria_mostradas_se_implican() -> None:
    juez = JuezPorTexto(PRINCIPAL, SECUNDARIA)

    assert soporte_de(juez, MARCO_ES + PRINCIPAL, (MARCO_ES + SECUNDARIA,)) is True


def test_no_tiene_soporte_cuando_la_principal_no_figura_en_lo_mostrado() -> None:
    juez = JuezPorTexto(PRINCIPAL, SECUNDARIA)

    assert soporte_de(juez, MARCO_ES + "otro texto", (MARCO_ES + SECUNDARIA,)) is False
