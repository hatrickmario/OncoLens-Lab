"""CLI ``python -m app.evaluation.vm {baseline,pares-validacion}``: toda la E/S del comando vive aquí."""

from __future__ import annotations

from collections.abc import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    raise NotImplementedError


if __name__ == "__main__":
    raise SystemExit(main())
