"""Llamadas salientes de la suite y el recuento de las que van a la nube con datos reales (RN-12, US-072 AC-6)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class LlamadaSaliente:
    destino: str
    clase_datos: str


@dataclass
class RegistroDeLlamadas:
    llamadas: list[LlamadaSaliente] = field(default_factory=list)

    def registrar(self, destino: str, clase_datos: str) -> None:
        raise NotImplementedError("no implementado")


def llamadas_a_nube_con_datos_reales(llamadas: Iterable[LlamadaSaliente]) -> int:
    raise NotImplementedError("no implementado")
