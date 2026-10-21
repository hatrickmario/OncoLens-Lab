"""Runner `evaluate` (US-072, ADR-41): `python -m app.evaluation.evaluate --config <ruta>`."""

from __future__ import annotations

from collections.abc import Sequence

from app.application.ports import Clock


def main(argv: Sequence[str], *, reloj: Clock | None = None) -> int:
    raise NotImplementedError("no implementado")
