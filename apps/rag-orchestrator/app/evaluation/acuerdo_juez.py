"""Juez LLM local acotado y acuerdo medido contra el NLI (US-233a AC-5 y AC-6, ADR-41, RN-12).

El juez recibe UNA afirmación y solo los fragmentos que cita; responde JSON estricto. Todo lo que no cumpla la forma
cuenta como «no soportada» y se contabiliza. El acuerdo con el NLI se mide con funciones puras y nunca se promedia: el
NLI sigue siendo el juez principal. Los textos viven en memoria y no llegan a mensajes de error ni al reporte (RN-14).
"""

from __future__ import annotations

import json
from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

VEREDICTO_SOPORTADA = "soportada"
VEREDICTO_NO_SOPORTADA = "no_soportada"
ESTADO_CONCLUYENTE = "concluyente"
ESTADO_NO_CONCLUYENTE = "no_concluyente"
SIN_MEDIR = "sin_medir"
"""Marca de lo que aún no tiene muestra (juez↔humano hasta DEC-06): nunca ``0``."""

SISTEMA = (
    "Eres un verificador de afirmaciones. Decide si la afirmación se desprende de los fragmentos dados y de nada más. "
    "Rúbrica binaria: responde soportada solo si TODA la afirmación está respaldada por un fragmento; si una parte no "
    "está respaldada, responde no_soportada. "
    'Responde únicamente JSON: {"veredicto": "soportada|no_soportada", "cita": "<id del fragmento que la respalda>"}. '
    'Con no_soportada deja "cita" vacía.\n'
    "Ejemplo 1 (soportada). F1: «El estudio incluyó 120 pacientes con cáncer de mama HER2 positivo.» "
    "Afirmación: «El estudio incluyó pacientes con cáncer de mama HER2 positivo.» "
    'Respuesta: {"veredicto": "soportada", "cita": "F1"}\n'
    "Ejemplo 2 (no soportada). F1: «La mediana de seguimiento fue de 24 meses.» "
    "Afirmación: «La mediana de seguimiento fue de 60 meses.» "
    'Respuesta: {"veredicto": "no_soportada", "cita": ""}\n'
    "Ejemplo 3 (parcial = no soportada). F1: «Se observó mayor supervivencia libre de progresión.» "
    "Afirmación: «Se observó mayor supervivencia libre de progresión y mayor supervivencia global.» "
    'Respuesta: {"veredicto": "no_soportada", "cita": ""}'
)
ESQUEMA_DEL_VEREDICTO: dict[str, Any] = {
    "type": "object",
    "properties": {
        "veredicto": {"type": "string", "enum": [VEREDICTO_SOPORTADA, VEREDICTO_NO_SOPORTADA]},
        "cita": {"type": "string"},
    },
    "required": ["veredicto", "cita"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class VeredictoDelJuez:
    soportada: bool
    valido: bool
    """``False`` si el JSON no se pudo interpretar o la cita no está entre los fragmentos: cuenta como no soportada."""


class CompletadorDelJuez(Protocol):
    async def completar(self, sistema: str, usuario: str) -> str:
        """El contenido de la respuesta del LLM del juez para un par (sistema, usuario)."""
        ...


def mensaje_de_usuario(afirmacion: str, fragmentos: Mapping[str, str]) -> str:
    """El único insumo del juez: la afirmación y los fragmentos que cita, cada uno con su id."""
    lista = "\n".join(f"{id_}: {texto}" for id_, texto in fragmentos.items())
    return f"Fragmentos:\n{lista}\n\nAfirmación: {afirmacion}"


def parsear_veredicto(contenido: str, ids_de_fragmentos: Collection[str]) -> VeredictoDelJuez:
    """Interpreta el JSON del juez; lo que no cumple la forma o cita un fragmento inexistente es no soportado."""
    invalido = VeredictoDelJuez(soportada=False, valido=False)
    try:
        cargado = json.loads(contenido)
    except ValueError:
        return invalido
    if not isinstance(cargado, dict):
        return invalido
    veredicto = cargado.get("veredicto")
    if veredicto == VEREDICTO_NO_SOPORTADA:
        return VeredictoDelJuez(soportada=False, valido=True)
    if veredicto == VEREDICTO_SOPORTADA and cargado.get("cita") in ids_de_fragmentos:
        return VeredictoDelJuez(soportada=True, valido=True)
    return invalido


async def juzgar_afirmacion(
    afirmacion: str, fragmentos_citados: Mapping[str, str], completador: CompletadorDelJuez
) -> VeredictoDelJuez:
    """Una afirmación y solo sus fragmentos; sin fragmentos no hay soporte ni llamada (igual que el NLI)."""
    if not fragmentos_citados:
        return VeredictoDelJuez(soportada=False, valido=True)
    contenido = await completador.completar(
        SISTEMA, mensaje_de_usuario(afirmacion, fragmentos_citados)
    )
    return parsear_veredicto(contenido, fragmentos_citados.keys())


def _exigir_misma_muestra(a: Sequence[bool], b: Sequence[bool]) -> None:
    if len(a) != len(b):
        raise ValueError("los veredictos comparados deben cubrir las mismas afirmaciones")


def porcentaje_de_acuerdo(a: Sequence[bool], b: Sequence[bool]) -> float | None:
    """Fracción de afirmaciones con el mismo veredicto; ``None`` (≠ 0.0) sin muestra."""
    _exigir_misma_muestra(a, b)
    if not a:
        return None
    return sum(x == y for x, y in zip(a, b, strict=True)) / len(a)


def kappa_de_cohen(a: Sequence[bool], b: Sequence[bool]) -> float | None:
    """Kappa de Cohen de dos jueces binarios; ``None`` sin muestra o si el azar ya explica todo el acuerdo."""
    observado = porcentaje_de_acuerdo(a, b)
    if observado is None:
        return None
    n = len(a)
    esperado = (sum(a) / n) * (sum(b) / n) + (1 - sum(a) / n) * (1 - sum(b) / n)
    if esperado == 1.0:
        return None
    return (observado - esperado) / (1 - esperado)


def marcar_fidelidad_no_concluyente(
    porcentaje_de_acuerdo_: float | None, minimo: float, muestra: int, muestra_minima: int
) -> bool:
    """RN-22: la fidelidad del juez no es concluyente sin acuerdo medible, bajo ``JUEZ_ACUERDO_MINIMO`` o con una
    muestra menor que ``JUEZ_MUESTRA_MINIMA`` (un acuerdo alto sobre dos afirmaciones no dice nada)."""
    if porcentaje_de_acuerdo_ is None or muestra < muestra_minima:
        return True
    return porcentaje_de_acuerdo_ < minimo


def acuerdo_con_el_nli(
    ids_de_afirmacion: Sequence[str],
    del_nli: Sequence[bool],
    del_juez: Sequence[bool],
) -> dict[str, Any]:
    """Acuerdo juez↔NLI para el reporte: muestra, porcentaje, kappa y discrepancias por id de afirmación."""
    _exigir_misma_muestra(ids_de_afirmacion, del_nli)
    porcentaje = porcentaje_de_acuerdo(del_nli, del_juez)
    return {
        "muestra": len(ids_de_afirmacion),
        "porcentaje": porcentaje,
        "kappa": kappa_de_cohen(del_nli, del_juez),
        "discrepancias": [
            id_
            for id_, nli, juez in zip(ids_de_afirmacion, del_nli, del_juez, strict=True)
            if nli != juez
        ],
    }


def estado_de_la_fidelidad_del_juez(
    porcentaje_de_acuerdo_: float | None, minimo: float, muestra: int, muestra_minima: int
) -> str:
    if marcar_fidelidad_no_concluyente(porcentaje_de_acuerdo_, minimo, muestra, muestra_minima):
        return ESTADO_NO_CONCLUYENTE
    return ESTADO_CONCLUYENTE
