"""Render del reporte ``eval/vm/baseline-S1.md``: puro, la fecha y la huella de DEC-02 llegan inyectadas."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.vm.dominio import Fila


def renderizar_reporte(
    filas: Sequence[Fila],
    manifiesto: dict[str, Any],
    medianas: dict[str, dict[str, float]],
    fecha: str,
    huella_dec02: str,
    max_minutos: int,
) -> str:
    raise NotImplementedError
