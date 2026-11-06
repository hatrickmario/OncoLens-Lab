"""Periodo de la pregunta del chat (US-261 AC-3, RN-11): reglas puras sobre días relativos, sin E/S ni fechas absolutas.

``periodo_de_la_pregunta`` reconoce «últimos N días, semanas, meses o años» (N en cifras o en palabras, del 1 al 12), «último
mes», «último año», «última semana» y «último día». Backend 2 nunca ve fechas absolutas: un periodo con fecha («desde marzo de
2025») no se reconoce y la pregunta no se filtra. ``filtrar_hechos_por_periodo`` acota los hechos por día relativo al
diagnóstico (negativo = antes): entra el hecho con ``día >= -N``; un hecho sin fecha confiable (``None``) queda fuera.

Un hecho con intervalo (``dia_relativo_fin``) entra si su fin cae dentro del periodo y, si empezó antes, lleva la marca
«(iniciado antes del periodo)» en su verbalización, de modo que el prompt, el NLI y el bloque usan el mismo texto. Hoy
``CaseFact`` solo trae el día de inicio (``relativeDay``): el fin llega a ``None`` y esta rama no se activa en integración.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import replace

from app.domain.chat.turno import HechoDelCaso

MARCA_INICIADO_ANTES_DEL_PERIODO = "(iniciado antes del periodo)"
DIAS_POR_UNIDAD = {"dia": 1, "semana": 7, "mes": 30, "ano": 365}
"""Conversión fija (definición, no calibrable): semana = 7, mes = 30, año = 365 días."""
_NUMEROS_EN_PALABRAS = {
    palabra: valor
    for valor, palabras in enumerate(
        (
            ("un", "uno", "una"),
            ("dos",),
            ("tres",),
            ("cuatro",),
            ("cinco",),
            ("seis",),
            ("siete",),
            ("ocho",),
            ("nueve",),
            ("diez",),
            ("once",),
            ("doce",),
        ),
        start=1,
    )
    for palabra in palabras
}
_PERIODO = re.compile(
    r"\bultim[oa]s?\s+(?:(?P<cantidad>\d{1,4}|"
    + "|".join(sorted(_NUMEROS_EN_PALABRAS, key=len, reverse=True))
    + r")\s+)?(?P<unidad>dia|semana|mes|ano)(?P<plural>s|es)?\b"
)


def periodo_de_la_pregunta(pregunta: str) -> int | None:
    """Los días del periodo que nombra la pregunta, o ``None`` si no nombra ninguno reconocido."""
    coincidencia = _PERIODO.search(_sin_tildes(pregunta))
    if coincidencia is None:
        return None
    cantidad = coincidencia["cantidad"]
    if cantidad is None:
        # «los últimos días» no dice cuántos: solo el singular («último mes») es un periodo.
        return None if coincidencia["plural"] else DIAS_POR_UNIDAD[coincidencia["unidad"]]
    n = int(cantidad) if cantidad.isdigit() else _NUMEROS_EN_PALABRAS[cantidad]
    return n * DIAS_POR_UNIDAD[coincidencia["unidad"]] if n > 0 else None


def filtrar_hechos_por_periodo(
    hechos: Sequence[HechoDelCaso], dias: int
) -> tuple[HechoDelCaso, ...]:
    """Los hechos dentro del periodo, en su orden; los que empezaron antes y terminan dentro llevan la marca."""
    conservados: list[HechoDelCaso] = []
    for hecho in hechos:
        if hecho.dia_relativo is None:
            continue
        fin = hecho.dia_relativo if hecho.dia_relativo_fin is None else hecho.dia_relativo_fin
        if fin < -dias:
            continue
        conservados.append(hecho if hecho.dia_relativo >= -dias else _marcado(hecho))
    return tuple(conservados)


def _marcado(hecho: HechoDelCaso) -> HechoDelCaso:
    return replace(hecho, verbalizacion=f"{hecho.verbalizacion} {MARCA_INICIADO_ANTES_DEL_PERIODO}")


def _sin_tildes(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto.casefold())
    return "".join(c for c in descompuesto if not unicodedata.combining(c))
