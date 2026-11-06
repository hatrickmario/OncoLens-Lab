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
            r"|\bque (?:tratamiento|terapia|esquema|opcion|opciones)\b(?! (?:previo|anterior))|\bdeb(?:e|en|eria|erian)\b|\brecomend\w+"
        ),
    ),
    (
        Intencion.caso,
        re.compile(
            r"\bsituacion\b|\bresumen\b|\bestado actual\b|\bdiagnostic\w+|\bque sabemos\b|\bantecedentes\b"
            r"|\btratamientos? (?:previos?|anterior(?:es)?)\b|\bbiomarcador\w*|\bestadio\b|\bhistoria\b|\bcuentame\b"
        ),
    ),
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
