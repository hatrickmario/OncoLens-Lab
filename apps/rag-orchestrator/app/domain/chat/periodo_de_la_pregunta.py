"""Periodo de la pregunta del chat (US-261 AC-3, RN-11): reglas puras sobre días relativos, sin E/S ni fechas absolutas.

``periodo_de_la_pregunta`` reconoce «últimos N días, semanas, meses o años» (N en cifras o en palabras, del 1 al 12), «último
mes», «último año», «última semana» y «último día». Backend 2 nunca ve fechas absolutas: un periodo con fecha («desde marzo de
2025») no se reconoce y la pregunta no se filtra. ``filtrar_hechos_por_periodo`` acota los hechos por día relativo al
diagnóstico, día 0 = el diagnóstico, no hoy (negativo = antes): entra el hecho con ``día >= -N``; un hecho sin fecha confiable (``None``) queda fuera.

Un hecho con intervalo (``dia_relativo_fin``) entra si su fin cae dentro del periodo y uno en curso (``en_curso``) siempre;
si empezó antes, lleva la marca «(iniciado antes del periodo)» y si está en curso, «(en curso)» en su verbalización, de modo
que el prompt, el NLI y el bloque usan el mismo texto. El que terminó antes del periodo se excluye sin marca (US-272).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import replace

from app.domain.chat.turno import HechoDelCaso
from app.domain.lenguaje import sin_tildes

MARCA_INICIADO_ANTES_DEL_PERIODO = "(iniciado antes del periodo)"
MARCA_EN_CURSO = "(en curso)"
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
    coincidencia = _PERIODO.search(sin_tildes(pregunta))
    if coincidencia is None:
        return None
    cantidad = coincidencia["cantidad"]
    if cantidad is None:
        # «los últimos días» no dice cuántos: solo el singular («último mes») es un periodo.
        return None if coincidencia["plural"] else DIAS_POR_UNIDAD[coincidencia["unidad"]]
    n = int(cantidad) if cantidad.isdigit() else _NUMEROS_EN_PALABRAS[cantidad]
    return n * DIAS_POR_UNIDAD[coincidencia["unidad"]] if n > 0 else None


def tiene_intervalo(hecho: HechoDelCaso) -> bool:
    """``True`` si el hecho trae ``relativeEndDay`` (entero o ``null`` explícito): lo decide la rama de intervalo."""
    return hecho.en_curso or hecho.dia_relativo_fin is not None


def filtrar_hechos_por_periodo(
    hechos: Sequence[HechoDelCaso], dias: int
) -> tuple[HechoDelCaso, ...]:
    """Los hechos dentro del periodo, en su orden, con las marcas de inicio anterior y de en curso cuando corresponden."""
    conservados: list[HechoDelCaso] = []
    for hecho in hechos:
        if hecho.dia_relativo is None or _termino_antes_del_periodo(hecho, dias):
            continue
        conservados.append(_marcado(hecho, dias))
    return tuple(conservados)


def _termino_antes_del_periodo(hecho: HechoDelCaso, dias: int) -> bool:
    if hecho.en_curso:
        return False
    fin = hecho.dia_relativo if hecho.dia_relativo_fin is None else hecho.dia_relativo_fin
    return fin is not None and fin < -dias


def _marcado(hecho: HechoDelCaso, dias: int) -> HechoDelCaso:
    marcas = []
    if hecho.dia_relativo is not None and hecho.dia_relativo < -dias:
        marcas.append(MARCA_INICIADO_ANTES_DEL_PERIODO)
    if hecho.en_curso:
        marcas.append(MARCA_EN_CURSO)
    if not marcas:
        return hecho
    return replace(hecho, verbalizacion=" ".join((hecho.verbalizacion, *marcas)))
