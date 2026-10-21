"""CLI de la comparación de regresión (US-074): ``python -m app.evaluation.comparar_regresion``.

``--reporte <json de evaluate> --config <regression.yaml>``. Códigos de salida: 0 sin umbrales (con el aviso en la salida
estándar) o todas las métricas sobre su mínimo; 1 alguna métrica por debajo (cada una se nombra en la salida de error);
2 uso, reporte o umbrales inválidos. Solo nombres y agregados: nunca textos (RN-14).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.evaluation.regresion import (
    AVISO_SIN_BASELINE,
    ResultadoRegresion,
    UmbralesInvalidos,
    cargar_umbrales,
    comparar_con_regresion,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="comparar_regresion", exit_on_error=False)
    parser.add_argument("--reporte", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    return parser


def _leer_reporte(ruta: Path) -> dict[str, Any]:
    try:
        reporte = json.loads(ruta.read_text(encoding="utf-8"))
        reporte["metricas"]["completa"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise UmbralesInvalidos(
            "el reporte no se puede leer o no trae metricas.completa"
        ) from error
    return reporte


def _informar(resultado: ResultadoRegresion) -> int:
    if not resultado.aplicado:
        print(AVISO_SIN_BASELINE)
        return 0
    for fallo in resultado.incumplimientos:
        actual = "sin valor" if fallo.actual is None else fallo.actual
        print(
            f"regresión en {fallo.metrica}: mínimo {fallo.minimo}, actual {actual}", file=sys.stderr
        )
    return 1 if resultado.incumplimientos else 0


def main(argv: Sequence[str]) -> int:
    try:
        args = _parser().parse_args(list(argv))
        reporte = _leer_reporte(args.reporte)
        resultado = comparar_con_regresion(reporte, cargar_umbrales(args.config))
    except (argparse.ArgumentError, SystemExit, UmbralesInvalidos) as error:
        print(f"comparar_regresion: entrada inválida ({type(error).__name__})", file=sys.stderr)
        return 2
    return _informar(resultado)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
