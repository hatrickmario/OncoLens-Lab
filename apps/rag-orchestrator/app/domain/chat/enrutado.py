"""Enrutado de la pregunta del chat (US-259, design D3): reglas puras, sin E/S.

Dos reglas, ambas sobre la pregunta ya enmascarada y en NFC:

- ``es_fuera_de_alcance()`` reutiliza, sin copiarla, la pertinencia del seguimiento (`clasificar_contexto_del_seguimiento`):
  otra persona, otro tipo de cáncer del catálogo o un marcador de identidad sin enmascarar.
- ``clasificar_por_reglas()`` clasifica en ``caso``, ``faltantes``, ``evidencia`` o ``fuentes_limitaciones`` por patrones
  léxicos del español, en un orden fijo (de lo más específico a lo más general). Los patrones viven aquí y en ningún otro
  módulo. Una pregunta prescriptiva va a ``evidencia``: nunca es ``fuera_de_alcance`` (glosario S6 §3).
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from app.domain.chat.estado import Intencion
from app.domain.contexto_del_seguimiento import (
    ContextoDelSeguimiento,
    clasificar_contexto_del_seguimiento,
)
from app.domain.lenguaje import normalizar_texto

# Sobre el texto normalizado (minúsculas, sin acentos ni signos). "caso" a secas no clasifica: aparece en todas.
_REGLAS: tuple[tuple[Intencion, re.Pattern[str]], ...] = (
    (
        Intencion.faltantes,
        re.compile(r"\bfalt(?:a|an|ante|antes|ar)\b|\bincomplet\w+|\bsin registrar\b"),
    ),
    (
        Intencion.fuentes_limitaciones,
        re.compile(
            r"\bfuentes?\b|\blimitaci(?:on|ones)\b|\bde donde (?:sale|salen|viene|vienen)\b|\ben que se basa\b"
        ),
    ),
    (
        Intencion.evidencia,
        re.compile(
            r"\bevidencia\b|\bestudios?\b|\bensayos?\b|\bguias?\b|\bliteratura\b|\bpublicaci(?:on|ones)\b"
            # Preguntas prescriptivas: se responden como evidencia descrita, sin lenguaje prescriptivo (RN-23).
            r"|\bque (?:tratamiento|terapia|esquema|opcion|opciones)\b|\bdeb(?:e|en|eria|erian)\b|\brecomend\w+"
        ),
    ),
    (
        Intencion.caso,
        re.compile(
            r"\bsituacion\b|\bresumen\b|\bestado actual\b|\bdiagnostic\w+|\bque sabemos\b|\bantecedentes\b"
            r"|\btratamientos? previos?\b|\bbiomarcador\w*|\bestadio\b|\bhistoria\b|\bcuentame\b"
        ),
    ),
)


# Referencias léxicas al resultado de un análisis ya mostrado («ese estudio», «la población del estudio», «la segunda
# opción»…). Sobre el texto normalizado. Solo cuentan con un análisis activo (``es_seguimiento_de_evidencia``).
_REFERENCIA_AL_RESULTADO = re.compile(
    r"\b(?:ese|esa|esos|esas|dicho|dicha|dichos|dichas|mencionad[oa]s?|citad[oa]s?|anterior(?:es)?)\s+"
    r"(?:estudios?|ensayos?|opcion(?:es)?|guias?|fuentes?|resultados?|analisis|publicaci(?:on|ones))\b"
    r"|\bpoblacion(?:es)? (?:del|de los|de las) (?:estudios?|ensayos?)\b"
    r"|\b(?:primera|segunda|tercera|ultima)\s+opcion\b|\bopcion\s+[123]\b"
    r"|\b(?:del|en el|de este) analisis\b"
)


def es_seguimiento_de_evidencia(pregunta: str, hay_analisis_activo: bool) -> bool:
    """La pregunta se refiere al resultado del análisis activo de la conversación. Sin análisis activo nunca es
    seguimiento (ante la duda se crea un análisis nuevo: más registro, nunca menos trazabilidad)."""
    return (
        hay_analisis_activo
        and _REFERENCIA_AL_RESULTADO.search(normalizar_texto(pregunta)) is not None
    )


def es_fuera_de_alcance(
    pregunta: str, tipo_del_contexto: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> bool:
    """Otra persona, otro tipo de cáncer o un marcador de identidad sin enmascarar: respuesta determinista, sin LLM."""
    contexto = clasificar_contexto_del_seguimiento(pregunta, tipo_del_contexto, terminos_por_tipo)
    return contexto is ContextoDelSeguimiento.fuera_de_contexto


def clasificar_por_reglas(pregunta: str) -> Intencion | None:
    """La primera intención cuyo patrón aparece en la pregunta; ``None`` si ninguna clasifica (decide el LLM)."""
    texto = normalizar_texto(pregunta)
    return next((intencion for intencion, patron in _REGLAS if patron.search(texto)), None)
