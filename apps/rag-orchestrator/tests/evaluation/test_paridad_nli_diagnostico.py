"""Paridad entre el agrupamiento por afirmación del diagnóstico y la regla del dominio (``pares_a_verificar`` y
``veredictos_por_afirmacion``): con dos afirmaciones de igual texto y varias premisas cada una, ambas dan el mismo veredicto
por afirmación. Es la aserción que protege contra que el diagnóstico derive del soporte de producción (RN-01)."""

from __future__ import annotations

from app.domain.nli import ResultadoNli
from app.domain.support import (
    Afirmacion,
    PlanDeSoporte,
    pares_a_verificar,
    veredictos_por_afirmacion,
)
from app.evaluation.metricas.diagnostico import afirmaciones_juzgadas

UMBRAL = 0.7


def _afirmacion(texto: str, *premisas: str) -> Afirmacion:
    return Afirmacion(texto, "limitations[].text", (), tuple(premisas))


def test_dos_afirmaciones_de_igual_texto_con_varias_premisas_dan_el_veredicto_del_dominio() -> None:
    primera = _afirmacion("mismo texto", "p1", "p2")
    segunda = _afirmacion(
        "mismo texto", "p1", "p2"
    )  # mismo texto y mismas premisas: otra afirmación
    plan = PlanDeSoporte((), (primera, segunda))
    pares = pares_a_verificar(plan)
    resultados = [
        ResultadoNli("neutral", 0.2),
        ResultadoNli("entailment", 0.9),  # la primera: soportada por su segunda premisa
        ResultadoNli("neutral", 0.3),
        ResultadoNli("neutral", 0.4),  # la segunda: ninguna premisa la soporta
    ]

    juzgadas = afirmaciones_juzgadas(pares, resultados, UMBRAL)

    dominio = veredictos_por_afirmacion(plan, resultados, UMBRAL)
    assert [j.soportada for j in juzgadas] == [dominio[primera], dominio[segunda]] == [True, False]
    assert [j.p_entailment for j in juzgadas] == [0.9, 0.4]


def test_afirmaciones_distintas_con_una_premisa_dan_el_veredicto_del_dominio() -> None:
    a, b = _afirmacion("uno", "p1"), _afirmacion("dos", "p1")
    plan = PlanDeSoporte((), (a, b))
    resultados = [ResultadoNli("entailment", 0.95), ResultadoNli("neutral", 0.1)]

    juzgadas = afirmaciones_juzgadas(pares_a_verificar(plan), resultados, UMBRAL)

    dominio = veredictos_por_afirmacion(plan, resultados, UMBRAL)
    assert [j.soportada for j in juzgadas] == [dominio[a], dominio[b]]
