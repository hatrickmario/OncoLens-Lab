"""Enrutado de la pregunta del chat (US-259, design D3): reglas puras, sin E/S.

Dos reglas, ambas sobre la pregunta ya enmascarada y en NFC:

- ``es_fuera_de_alcance()`` reutiliza, sin copiarla, la pertinencia del seguimiento (`clasificar_contexto_del_seguimiento`):
  otra persona, otro tipo de cáncer del catálogo o un marcador de identidad sin enmascarar.
- ``clasificar_por_reglas()`` clasifica en ``caso``, ``faltantes``, ``evidencia`` o ``fuentes_limitaciones`` por patrones
  léxicos del español, en un orden fijo (de lo más específico a lo más general). Los patrones viven aquí y en ningún otro
  módulo. Una pregunta prescriptiva va a ``evidencia``: nunca es ``fuera_de_alcance`` (glosario S6 §3).
- ``es_pregunta_de_relevancia()`` reconoce «¿por qué importa…?» (US-264): va a ``faltantes`` y su nodo la atiende con la
  subintención de relevancia; pierde ante fuentes y evidencia y gana a ``caso``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from app.domain.chat.contradicciones import es_pregunta_de_contradicciones
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

_FALTANTES = re.compile(r"\bfalt(?:a|an|ante|antes|ar)\b|\bincomplet\w+|\bsin registrar\b")

# «¿Por qué importa el Ki-67?» (US-264): la relevancia de un dato crítico, que atiende el nodo ``faltantes``.
_RELEVANCIA = re.compile(
    r"\bpor que (?:importa|importan|es importante|son importantes|es relevante|son relevantes)\b"
    r"|\bpara que (?:sirve|sirven)\b|\b(?:que|cual es la) (?:relevancia|importancia)\b"
    r"|\bque tan (?:importante|relevante)s?\b"
)

# Sobre el texto normalizado (minúsculas, sin acentos ni signos). "caso" a secas no clasifica: aparece en todas.
_REGLAS: tuple[tuple[Intencion, re.Pattern[str]], ...] = (
    (Intencion.faltantes, _FALTANTES),
    (
        Intencion.fuentes_limitaciones,
        re.compile(
            r"\bfuentes?\b|\blimitaci(?:on|ones)\b|\bde donde (?:sale|salen|viene|vienen)\b|\ben que se basa\b"
            # «corpus» solo cuenta junto a un marcador de metadato: «qué evidencia hay en el corpus» es evidencia.
            r"|\bno cubre\b|\bfecha de corte\b"
            r"|\bcorpus\b(?=.*\b(?:fecha|corte|cubre|incluye)\b)"
            r"|\b(?:fecha|corte|cubre|incluye)\b.*\bcorpus\b"
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
    # Después de fuentes y evidencia (una pregunta de relevancia que nombra la evidencia o las fuentes es de ellas) y antes
    # de caso, que reclama cualquier biomarcador o término del catálogo.
    (Intencion.faltantes, _RELEVANCIA),
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


def es_pregunta_de_relevancia(pregunta: str) -> bool:
    """La pregunta pide por qué importa un dato (US-264); una pregunta de faltantes («qué falta», «lo que falta») no lo es."""
    texto = normalizar_texto(pregunta)
    return _RELEVANCIA.search(texto) is not None and _FALTANTES.search(texto) is None


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
    prescriptiva, RN-23— siguen ganando), una pregunta es de ``caso`` si pide las contradicciones del expediente
    (``es_pregunta_de_contradicciones``, US-262: sin LLM), si nombra un periodo reconocido
    (``periodo_de_la_pregunta``) o un término del catálogo clínico versionado (``terminos_del_catalogo``, ya normalizado:
    biomarcadores, fármacos, RN-27); sin esto el LLM la mandaba a ``faltantes`` y el turno salía sin respuesta."""
    texto = normalizar_texto(pregunta)
    por_regla = next((intencion for intencion, patron in _REGLAS if patron.search(texto)), None)
    if por_regla is not None:
        return por_regla
    if (
        es_pregunta_de_contradicciones(pregunta)
        or periodo_de_la_pregunta(pregunta) is not None
        or _nombra_un_termino(texto, terminos_del_catalogo)
    ):
        return Intencion.caso
    return None


def _nombra_un_termino(texto: str, terminos: frozenset[str]) -> bool:
    return any(re.search(rf"\b{re.escape(termino)}\b", texto) for termino in terminos if termino)
