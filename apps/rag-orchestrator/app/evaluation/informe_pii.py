"""Informe de sensibilidad del detector de PII de Backend 1 (ADR-40): el JSON de `npm run eval:pii` de clinical-api."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

TIPOS_DIRECTOS = ("nombre", "documento", "telefono", "correo", "direccion", "fecha_nacimiento")
MODOS = ("solo_formatos", "identidad_de_referencia")


class InformePiiInvalido(ValueError):
    """El informe no tiene la forma de `eval:pii`; el mensaje nombra la clave, nunca su valor."""


@dataclass(frozen=True)
class SensibilidadPii:
    aciertos: int
    total: int
    valor: float | None


@dataclass(frozen=True)
class ModoPii:
    por_tipo: dict[str, SensibilidadPii]
    total: SensibilidadPii
    tipos_por_debajo: int
    cumple_minimo: bool


@dataclass(frozen=True)
class InformePiiB1:
    textos: int
    modos: dict[str, ModoPii]


def interpretar_informe_pii(crudo: Mapping[str, Any]) -> InformePiiB1:
    raise NotImplementedError("no implementado")


class ProveedorPii(Protocol):
    def leer(self) -> InformePiiB1 | None:
        """La sensibilidad medida por B1, o ``None`` si no se midió (``null`` ≠ ``0.0``)."""
        ...


class ProveedorPiiDeArchivo:
    def __init__(self, ruta: Path) -> None:
        self._ruta = ruta

    def leer(self) -> InformePiiB1 | None:
        raise NotImplementedError("no implementado")
