"""Higiene de los tests de Python (L1D-285, US-213 AC-8, design D2).

Recorre el AST de `tests/**/*.py` de rag-orchestrator y reporta, como JSON en stdout, cada desactivación de un test:
los marcadores `skip`, `skipif` y `xfail` (decorador o `pytestmark`) y las llamadas `pytest.skip(` / `pytest.xfail(`.
Es AST, no texto: un comentario, un docstring o un string con `pytest.skip(` no alerta, y un módulo fuera de `tests/`
no se examina. `quality.mjs` lo invoca y normaliza cada hallazgo (regla `tests-sin-desactivar`).

Uso: python -I scripts/quality/check-pytest-hygiene.py <directorio-raíz-de-tests>
"""

import ast
import json
import sys
from pathlib import Path
from typing import Any

REGLA = "tests-sin-desactivar"
MARCADORES_PROHIBIDOS = frozenset({"skip", "skipif", "xfail"})
LLAMADAS_PROHIBIDAS = frozenset({"skip", "xfail"})


def _es_pytest(nodo: ast.expr) -> bool:
    return isinstance(nodo, ast.Name) and nodo.id == "pytest"


def _marcador_prohibido(nodo: ast.expr) -> str | None:
    """`pytest.mark.skip`, `pytest.mark.skipif(...)`, `pytest.mark.xfail(...)` → nombre del marcador."""
    objetivo = nodo.func if isinstance(nodo, ast.Call) else nodo
    if (
        isinstance(objetivo, ast.Attribute)
        and objetivo.attr in MARCADORES_PROHIBIDOS
        and isinstance(objetivo.value, ast.Attribute)
        and objetivo.value.attr == "mark"
        and _es_pytest(objetivo.value.value)
    ):
        return f"pytest.mark.{objetivo.attr}"
    return None


def _llamada_prohibida(nodo: ast.Call) -> str | None:
    """`pytest.skip(...)` y `pytest.xfail(...)` → nombre de la llamada."""
    funcion = nodo.func
    if (
        isinstance(funcion, ast.Attribute)
        and funcion.attr in LLAMADAS_PROHIBIDAS
        and _es_pytest(funcion.value)
    ):
        return f"pytest.{funcion.attr}("
    return None


def hallazgos_de_modulo(arbol: ast.AST) -> list[tuple[int, str]]:
    """(línea, símbolo) de cada desactivación."""
    encontrados: set[tuple[int, str]] = set()
    for nodo in ast.walk(arbol):
        marcador = _marcador_prohibido(nodo) if isinstance(nodo, ast.expr) else None
        if marcador:
            encontrados.add((nodo.lineno, marcador))
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Call):
            llamada = _llamada_prohibida(nodo)
            if llamada:
                encontrados.add((nodo.lineno, llamada))
    return sorted(encontrados)


def revisar(raiz: Path) -> list[dict[str, Any]]:
    hallazgos: list[dict[str, Any]] = []
    for archivo in sorted(raiz.rglob("*.py")):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"), filename=str(archivo))
        for linea, simbolo in hallazgos_de_modulo(arbol):
            hallazgos.append(
                {
                    "file": archivo.as_posix(),
                    "line": linea,
                    "rule": REGLA,
                    "symbol": simbolo,
                }
            )
    return hallazgos


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("uso: check-pytest-hygiene.py <directorio-de-tests>")
    print(json.dumps(revisar(Path(sys.argv[1]))))
