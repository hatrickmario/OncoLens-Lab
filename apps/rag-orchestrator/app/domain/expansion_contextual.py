"""Parámetros del segundo loop contextual (US-271, ADR-52, RN-22): reglas puras, sin E/S.

El loop contextual añade a la consulta términos del caso tomados del catálogo versionado (RN-27) cuando la pregunta no
tiene tema propio y el primer loop quedó vacío. Este módulo es el único lugar donde aparecen los literales de los campos
y de los formatos; el indicador, la lista de campos y el formato salen de ``Settings`` (``QUERY_CONTEXT_EXPANSION_*``).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

CAMPO_TIPO = "tipo"
CAMPO_ESTADIO = "estadio"
CAMPO_BIOMARCADOR_PRINCIPAL = "biomarcador_principal"
CAMPOS_DE_EXPANSION = (CAMPO_TIPO, CAMPO_ESTADIO, CAMPO_BIOMARCADOR_PRINCIPAL)
"""Conjunto cerrado de campos del caso (el enum de ``contextExpansion.fields`` del contrato): nunca valores."""

FORMATO_PLANO = "plano"
FORMATOS_DE_CONSULTA = (FORMATO_PLANO,)
"""Formatos de la consulta que puntúa el *reranker*: ``plano`` = ``"<pregunta> <términos separados por espacio>"``."""

EXPANSION_CAMPOS_INICIAL = CAMPOS_DE_EXPANSION
EXPANSION_HABILITADA_INICIAL = True
"""Valores iniciales de ``QUERY_CONTEXT_EXPANSION_*`` (RN-22); activo por defecto desde US-275 (``false`` en el entorno lo apaga: sin segundo loop)."""


@dataclass(frozen=True)
class ParametrosDeExpansionContextual:
    """``QUERY_CONTEXT_EXPANSION_ENABLED``, ``_FIELDS`` y ``_RERANK_FORMAT``: activado por defecto (RN-22, US-275)."""

    habilitada: bool = EXPANSION_HABILITADA_INICIAL
    campos: tuple[str, ...] = EXPANSION_CAMPOS_INICIAL
    formato: str = FORMATO_PLANO


def consulta_contextual(pregunta: str, terminos: Sequence[str], formato: str) -> str:
    """La consulta que se embebe y puntúa en el loop contextual: la pregunta original primero y los términos después."""
    if formato != FORMATO_PLANO:
        raise ValueError("formato de consulta contextual desconocido")
    return " ".join((pregunta, *terminos))
