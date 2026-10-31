"""Segundo loop de reescritura de la consulta (US-238, RN-02 enmendada): reglas puras, sin E/S.

Solo se reescribe tras un primer loop sin chunks sobre el umbral; los términos que agrega el LLM salen del catálogo
versionado (RN-27) y la pregunta original sigue mandando sobre el puntaje y la respuesta (RN-03, RN-06).
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.lenguaje import normalizar_texto

REESCRITURA_MAX_ITERACIONES_INICIAL = 1
REESCRITURA_PLAZO_MS_INICIAL = 3000
REESCRITURA_MAX_TOKENS_DE_SALIDA_INICIAL = 128
REESCRITURA_MAX_TERMINOS_INICIAL = 5
"""Valores iniciales de ``QUERY_REWRITE_*`` (RN-22): el único lugar donde aparecen los literales; los recalibra la evaluación."""


class MotivoDeReescritura(StrEnum):
    disparado = "disparado"
    no_disparado = "no_disparado"
    no_disponible = "no_disponible"
    no_aplica = "no_aplica"


@dataclass(frozen=True)
class EstadoDeReescritura:
    """``meta.retrievalParams.queryRewrite``: ``applied`` es verdadero si y solo si el motivo es ``disparado``."""

    motivo: MotivoDeReescritura

    @property
    def applied(self) -> bool:
        return self.motivo is MotivoDeReescritura.disparado


@dataclass(frozen=True)
class ParametrosDeReescritura:
    """``QUERY_REWRITE_ENABLED``, ``QUERY_REWRITE_MAX_ITERATIONS`` y ``QUERY_REWRITE_DEADLINE_MS`` (RN-22)."""

    habilitada: bool = False
    max_iteraciones: int = REESCRITURA_MAX_ITERACIONES_INICIAL
    plazo_ms: int = REESCRITURA_PLAZO_MS_INICIAL


@dataclass(frozen=True)
class ConsultaDelSegundoLoop:
    """Lo que cambia entre loops: ``texto_de_busqueda`` solo alimenta el vector; ``pregunta_original`` puntúa y se guarda."""

    texto_de_busqueda: str
    pregunta_original: str


def debe_reescribir(
    chunks_sobre_umbral: int, habilitada: bool, iteracion: int, max_iteraciones: int
) -> bool:
    """RN-02 enmendada: solo con el loop previo vacío, la reescritura habilitada y iteraciones por consumir.

    ``iteracion`` cuenta los segundos loops ya ejecutados (0 antes del primero)."""
    return habilitada and chunks_sobre_umbral == 0 and iteracion < max_iteraciones


def filtrar_terminos_del_catalogo(
    propuestos: Sequence[str], catalogo: Collection[str]
) -> tuple[str, ...]:
    """Solo los términos que el catálogo versionado conoce (RN-27), normalizados, sin repetir y en orden de aparición.

    ``catalogo`` ya viene normalizado (``normalizar_texto``); el resto se descarta sin inventar códigos."""
    admitidos: dict[str, None] = {}
    for termino in propuestos:
        normalizado = normalizar_texto(termino)
        if normalizado in catalogo:
            admitidos.setdefault(normalizado)
    return tuple(admitidos)


def conservar_pregunta_original(pregunta: str, terminos: Sequence[str]) -> ConsultaDelSegundoLoop:
    """La original manda (RN-03, RN-06): los términos solo se suman al texto que se embebe, nunca la sustituyen."""
    return ConsultaDelSegundoLoop(
        texto_de_busqueda=" ".join((pregunta, *terminos)), pregunta_original=pregunta
    )
