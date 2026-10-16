"""Genera la partición desarrollo/validación/prueba del golden `adr39-mini` (OL-06, ADR-45).

Determinista y solo con la biblioteca estándar más PyYAML: no usa modelos, no lee resultados de recuperación
y no depende del orden del archivo. Se ejecutó UNA vez, antes de cualquier experimento; el resultado
(`particion.yaml`) queda congelado. Cambiarlo exige una versión nueva del directorio, no editar éste.

    python3 -I data/eval/ol06-particion-v1/generar_particion.py \
        --golden data/eval/adr39-mini/golden.yaml --salida data/eval/ol06-particion-v1/particion.yaml

Reglas (ADR-45, protocolo P2):
- Unidad de partición = grupo: una pregunta y su control en inglés (`control_de`) caen siempre en el mismo
  conjunto, porque son la misma pregunta traducida y no son independientes.
- Estratos = tipo de cáncer x clase de pregunta (`valor`, `sin_respuesta`, otras), para que cada conjunto
  tenga mama y próstata, preguntas de valor numérico y preguntas sin respuesta.
- Dentro de cada estrato, los grupos se ordenan por SHA-256(sal + clave del grupo) y se reparten en el
  ciclo fijo desarrollo, validación, desarrollo, prueba (50 / 25 / 25 aproximado).
"""

from __future__ import annotations

import argparse
import hashlib
from collections import Counter, defaultdict
from pathlib import Path

import yaml

SAL = "ol06-particion-v1"
CICLO = ("desarrollo", "validacion", "desarrollo", "prueba")


def clase_de_pregunta(pregunta: dict) -> str:
    if pregunta["tipo"] == "sin_respuesta":
        return "sin_respuesta"
    return "valor" if pregunta["tipo"] == "valor" else "otras"


def clave_de_grupo(pregunta: dict) -> str:
    return pregunta.get("control_de") or pregunta["id"]


def huella(clave: str) -> str:
    return hashlib.sha256(f"{SAL}:{clave}".encode()).hexdigest()


def particionar(preguntas: list[dict]) -> dict[str, str]:
    grupos: dict[str, list[dict]] = defaultdict(list)
    for p in preguntas:
        grupos[clave_de_grupo(p)].append(p)
    estratos: dict[tuple[str, str], list[str]] = defaultdict(list)
    for clave, miembros in grupos.items():
        original = next(m for m in miembros if m["idioma"] == "es")
        estratos[(original["cancer"], clase_de_pregunta(original))].append(clave)
    asignacion: dict[str, str] = {}
    for estrato in sorted(estratos):
        for posicion, clave in enumerate(sorted(estratos[estrato], key=huella)):
            conjunto = CICLO[posicion % len(CICLO)]
            for miembro in grupos[clave]:
                asignacion[miembro["id"]] = conjunto
    return asignacion


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--golden", required=True, type=Path)
    ap.add_argument("--salida", required=True, type=Path)
    args = ap.parse_args()
    bruto = args.golden.read_bytes()
    golden = yaml.safe_load(bruto)
    preguntas = golden["preguntas"]
    asignacion = particionar(preguntas)
    resumen = Counter(asignacion.values())
    documento = {
        "clase": "sintetico",
        "version": "1",
        "sal": SAL,
        "ciclo": list(CICLO),
        "golden_sha256": hashlib.sha256(bruto).hexdigest(),
        "total_preguntas": len(preguntas),
        "resumen": dict(sorted(resumen.items())),
        "asignacion": {
            conjunto: sorted(i for i, c in asignacion.items() if c == conjunto)
            for conjunto in ("desarrollo", "validacion", "prueba")
        },
    }
    args.salida.write_text(yaml.safe_dump(documento, allow_unicode=True, sort_keys=False, width=120), encoding="utf-8")


if __name__ == "__main__":
    main()
