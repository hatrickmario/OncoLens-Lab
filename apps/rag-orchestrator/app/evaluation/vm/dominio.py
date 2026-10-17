"""Reglas puras del baseline manual de VM-1 y VM-2: sin E/S, solo biblioteca estándar.

Todos los errores nombran fila y regla, nunca el valor rechazado (RN-14).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

COLUMNAS = (
    "participante",
    "caso",
    "condicion",
    "tiempo_reconstruccion_min",
    "reconstruido",
    "tiempo_evidencia_min",
    "autoidentificada",
    "fuente_id",
    "validada",
)
EJES_CRITICOS = (
    "diagnostico",
    "estadio_a_la_fecha",
    "biomarcadores",
    "intencion_terapeutica",
    "secuencia_previa",
    "linea_actual",
)
TIPOS_DE_CANCER = ("mama", "prostata")

Fila = dict[str, str]


@dataclass(frozen=True)
class ConfigVM:
    """Valores de ``eval/vm/baseline.json`` (RN-22)."""

    max_minutos: int
    patron_participante: str
    patron_fuente: str


def validar_manifiesto(
    manifiesto: dict[str, Any], existe_documento: Callable[[str], bool]
) -> list[str]:
    raise NotImplementedError


def validar_cabecera(cabecera: Sequence[str]) -> list[str]:
    raise NotImplementedError


def validar_fila_sesion(fila: Fila, numero: int, casos: set[str], config: ConfigVM) -> list[str]:
    raise NotImplementedError


def validar_coherencia_validacion(filas: Sequence[Fila]) -> list[str]:
    raise NotImplementedError


def validar_registro(
    filas: Sequence[Fila], manifiesto: dict[str, Any], config: ConfigVM
) -> list[str]:
    raise NotImplementedError


def pares_para_validacion(
    filas: Sequence[Fila], manifiesto: dict[str, Any]
) -> list[tuple[str, str, str]]:
    raise NotImplementedError


def medianas_por_tipo(
    filas: Sequence[Fila], manifiesto: dict[str, Any], max_minutos: int
) -> dict[str, dict[str, float]]:
    raise NotImplementedError
