"""Las afirmaciones de la propuesta cruda que el pipeline envía al NLI, con las premisas que las respaldan (RN-01).

Delega en ``domain.support.afirmaciones_para_el_nli`` (afirmaciones atómicas por papel y limitaciones; fuera
lo que incumple el lenguaje de RN-23); un test de paridad compara orden y texto contra ``pares_a_verificar``.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.application.ports import EvidenciaGenerada
from app.domain.citations import validar_citas
from app.domain.support import (
    BuscadorDeTerminos,
    PlanDeSoporte,
    afirmaciones_para_el_nli,
    planificar_soporte,
)


@dataclass(frozen=True)
class AfirmacionAJuzgar:
    texto: str
    premisas: tuple[str, ...]


def plan_de_la_propuesta(
    propuesta: EvidenciaGenerada,
    textos_entregados: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
    max_palabras: int,
) -> PlanDeSoporte:
    """El plan de soporte de las opciones cuyas citas son válidas (las demás se descartan antes del NLI)."""
    aceptadas = validar_citas(propuesta.opciones, textos_entregados.keys()).aceptadas
    return planificar_soporte(
        aceptadas,
        propuesta.limitaciones_propuestas,
        textos_entregados,
        buscar_terminos,
        max_palabras=max_palabras,
    )


def afirmaciones_a_juzgar(plan: PlanDeSoporte) -> list[AfirmacionAJuzgar]:
    """Las que el pipeline envía al NLI: la misma función de ``domain.support``, no una copia (RN-01, RN-23)."""
    return [AfirmacionAJuzgar(a.texto, a.premisas) for a in afirmaciones_para_el_nli(plan)]
