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
from app.domain.chat.periodo_de_la_pregunta import periodo_de_la_pregunta
from app.domain.lenguaje import normalizar_texto

_PREVIO = r"(?:previos?|anterior(?:es)?)\b"
"""«previo/anterior» tras «tratamiento»: describe lo ya recibido (caso), no pide una opción (evidencia, RN-23). Una sola
definición para la regla de ``evidencia`` (que lo excluye) y la de ``caso`` (que lo reclama)."""

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
            r"|\bque (?:tratamiento|terapia|esquema|opcion|opciones)\b(?! " + _PREVIO + r")"
            r"|\bdeb(?:e|en|eria|erian)\b|\brecomi?end\w+"
        ),
    ),
    (
        Intencion.caso,
        re.compile(
            r"\bsituacion\b|\bresumen\b|\bestado actual\b|\bdiagnostic\w+|\bque sabemos\b|\bantecedentes\b"
            r"|\btratamientos? "
            + _PREVIO
            + r"|\bbiomarcador\w*|\bestadio\b|\bhistoria\b|\bcuentame\b"
            # Un examen o un hecho puntual del expediente (US-261): su resultado, qué ocurrió, cuándo se hizo.
            r"|\bresultados? (?:de|del)\b|\bque (?:ocurrio|paso|sucedio|hubo)\b"
            r"|\bcuando se (?:hizo|realizo|inicio|indico|detecto|diagnostico)\b"
        ),
    ),
)


def es_fuera_de_alcance(
    pregunta: str, tipo_del_contexto: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> bool:
    """Otra persona, otro tipo de cáncer o un marcador de identidad sin enmascarar: respuesta determinista, sin LLM."""
    contexto = clasificar_contexto_del_seguimiento(pregunta, tipo_del_contexto, terminos_por_tipo)
    return contexto is ContextoDelSeguimiento.fuera_de_contexto


def clasificar_por_reglas(
    pregunta: str, terminos_del_catalogo: frozenset[str] = frozenset()
) -> Intencion | None:
    """La primera intención cuyo patrón aparece en la pregunta; ``None`` si ninguna clasifica (decide el LLM).

    Después de las reglas léxicas, y solo si ninguna clasificó (así faltantes, fuentes y evidencia —incluida la
    prescriptiva, RN-23— siguen ganando), una pregunta es de ``caso`` si nombra un periodo reconocido
    (``periodo_de_la_pregunta``) o un término del catálogo clínico versionado (``terminos_del_catalogo``, ya normalizado:
    biomarcadores, fármacos, RN-27); sin esto el LLM la mandaba a ``faltantes`` y el turno salía sin respuesta."""
    texto = normalizar_texto(pregunta)
    por_regla = next((intencion for intencion, patron in _REGLAS if patron.search(texto)), None)
    if por_regla is not None:
        return por_regla
    if periodo_de_la_pregunta(pregunta) is not None or _nombra_un_termino(
        texto, terminos_del_catalogo
    ):
        return Intencion.caso
    return None


def _nombra_un_termino(texto: str, terminos: frozenset[str]) -> bool:
    return any(re.search(rf"\b{re.escape(termino)}\b", texto) for termino in terminos if termino)
