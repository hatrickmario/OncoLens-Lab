"""CLI ``python -m app.evaluation.vm {baseline,pares-validacion}``: toda la E/S del comando vive aquí.

Ante un manifiesto o un registro inválidos termina con código 1 sin escribir nada; los errores nombran fila y
regla, nunca el valor rechazado (RN-14). Solo biblioteca estándar: no abre red ni base de datos.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.evaluation.rutas import raiz_repo
from app.evaluation.vm.dominio import (
    ConfigVM,
    Fila,
    medianas_por_tipo,
    pares_para_validacion,
    validar_cabecera,
    validar_manifiesto,
    validar_registro,
    validar_sesiones,
)
from app.evaluation.vm.reporte import renderizar_reporte


class ErrorDeEntrada(Exception):
    """Entrada inválida o ilegible; los mensajes nunca repiten valores de las filas."""

    def __init__(self, errores: Sequence[str]) -> None:
        super().__init__("; ".join(errores))
        self.errores = list(errores)


def _fecha_aaaa_mm_dd(texto: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", texto):
        raise argparse.ArgumentTypeError("la fecha debe tener el formato AAAA-MM-DD")
    return texto


def _construir_parser() -> argparse.ArgumentParser:
    raiz = raiz_repo()
    parser = argparse.ArgumentParser(prog="python -m app.evaluation.vm")
    sub = parser.add_subparsers(dest="comando", required=True)

    comunes = argparse.ArgumentParser(add_help=False)
    comunes.add_argument("--csv", type=Path, default=raiz / "eval/vm/baseline-S1.csv")
    comunes.add_argument(
        "--manifest", type=Path, default=raiz / "data/evaluation/vm-baseline/manifest.json"
    )

    baseline = sub.add_parser("baseline", parents=[comunes])
    baseline.add_argument("--fecha", required=True, type=_fecha_aaaa_mm_dd)
    baseline.add_argument("--out", type=Path, default=raiz / "eval/vm/baseline-S1.md")
    baseline.add_argument("--config", type=Path, default=raiz / "eval/vm/baseline.json")
    baseline.add_argument(
        "--dec02", type=Path, default=raiz / "docs/decisions/DEC-02-protocolo-vm.md"
    )

    pares = sub.add_parser("pares-validacion", parents=[comunes])
    pares.add_argument("--out", type=Path, default=raiz / "eval/vm/pares-validacion-S1.csv")
    pares.add_argument("--config", type=Path, default=raiz / "eval/vm/baseline.json")
    return parser


def _leer_json(ruta: Path) -> dict[str, Any]:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))  # type: ignore[no-any-return]
    except (OSError, json.JSONDecodeError) as exc:
        raise ErrorDeEntrada([f"no se pudo leer {ruta.name} como JSON"]) from exc


def _leer_config(ruta: Path) -> ConfigVM:
    datos = _leer_json(ruta)
    return ConfigVM(
        max_minutos=int(datos["VM_SESSION_MAX_MINUTES"]),
        patron_participante=datos["VM_PARTICIPANT_PATTERN"],
        patron_fuente=datos["VM_SOURCE_ID_PATTERN"],
    )


def _leer_manifiesto_validado(ruta: Path) -> dict[str, Any]:
    manifiesto = _leer_json(ruta)
    errores = validar_manifiesto(manifiesto, lambda doc: (ruta.parent / doc).is_file())
    if errores:
        raise ErrorDeEntrada(errores)
    return manifiesto


def _leer_sesiones(ruta: Path) -> list[Fila]:
    try:
        with ruta.open(encoding="utf-8", newline="") as archivo:
            lector = csv.DictReader(archivo)
            errores = validar_cabecera(lector.fieldnames or [])
            if errores:
                raise ErrorDeEntrada(errores)
            return [{k: (v or "").strip() for k, v in fila.items()} for fila in lector]
    except OSError as exc:
        raise ErrorDeEntrada([f"no se pudo leer {ruta.name}"]) from exc


def _sin_errores(errores: list[str]) -> None:
    if errores:
        raise ErrorDeEntrada(errores)


def _escribir(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(texto, encoding="utf-8", newline="")


def _ejecutar_baseline(args: argparse.Namespace) -> None:
    config = _leer_config(args.config)
    manifiesto = _leer_manifiesto_validado(args.manifest)
    filas = _leer_sesiones(args.csv)
    _sin_errores(validar_registro(filas, manifiesto, config))
    try:
        huella = hashlib.sha256(args.dec02.read_bytes()).hexdigest()
    except OSError as exc:
        raise ErrorDeEntrada([f"no se pudo leer {args.dec02.name}"]) from exc
    medianas = medianas_por_tipo(filas, manifiesto, config.max_minutos)
    reporte = renderizar_reporte(
        filas, manifiesto, medianas, args.fecha, huella, config.max_minutos
    )
    _escribir(args.out, reporte)


def _ejecutar_pares_validacion(args: argparse.Namespace) -> None:
    config = _leer_config(args.config)
    manifiesto = _leer_manifiesto_validado(args.manifest)
    filas = _leer_sesiones(args.csv)
    _sin_errores(validar_sesiones(filas, manifiesto, config))
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\n")
    escritor.writerow(["caso", "pregunta_referencia", "fuente_id"])
    escritor.writerows(pares_para_validacion(filas, manifiesto))
    _escribir(args.out, salida.getvalue())


def main(argv: Sequence[str] | None = None) -> int:
    args = _construir_parser().parse_args(argv)
    try:
        if args.comando == "baseline":
            _ejecutar_baseline(args)
        else:
            _ejecutar_pares_validacion(args)
    except ErrorDeEntrada as error:
        for linea in error.errores:
            print(f"error: {linea}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
