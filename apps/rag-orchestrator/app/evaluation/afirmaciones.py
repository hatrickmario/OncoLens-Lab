"""Las afirmaciones de la propuesta cruda que el pipeline envía al NLI, con las premisas que las respaldan (RN-01).

Mismo criterio que ``domain.support`` (afirmaciones de la justificación, de los párrafos de detalle y de las
limitaciones; fuera las que incumplen el lenguaje de RN-23, que nunca llegan al NLI): un test de paridad compara
ambos recuentos contra ``pares_a_verificar``.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from dataclasses import dataclass

from app.application.ports import EvidenciaGenerada
from app.domain.citations import validar_citas
from app.domain.support import Afirmacion, BuscadorDeTerminos, PlanDeSoporte, planificar_soporte


@dataclass(frozen=True)
class AfirmacionAJuzgar:
    texto: str
    premisas: tuple[str, ...]


def plan_de_la_propuesta(
    propuesta: EvidenciaGenerada,
    textos_entregados: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
) -> PlanDeSoporte:
    """El plan de soporte de las opciones cuyas citas son válidas (las demás se descartan antes del NLI)."""
    aceptadas = validar_citas(propuesta.opciones, textos_entregados.keys()).aceptadas
    return planificar_soporte(
        aceptadas, propuesta.limitaciones_propuestas, textos_entregados, buscar_terminos
    )


def afirmaciones_a_juzgar(plan: PlanDeSoporte) -> list[AfirmacionAJuzgar]:
    return [AfirmacionAJuzgar(a.texto, a.premisas) for a in _sin_lenguaje_prohibido(plan)]


def _sin_lenguaje_prohibido(plan: PlanDeSoporte) -> Iterator[Afirmacion]:
    for opcion in plan.opciones:
        if opcion.option.reglas:
            continue
        yield from (a for a in opcion.afirmaciones if not a.reglas)
        for parrafo in opcion.detalles:
            if not any(a.reglas for a in parrafo):
                yield from parrafo
    yield from (limitacion for limitacion in plan.limitaciones if not limitacion.reglas)
