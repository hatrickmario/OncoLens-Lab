"""Higiene de los tests de Python (L1D-285, US-213 AC-8, design D2).

Recorre el AST de `tests/**/*.py` de rag-orchestrator y reporta, como JSON en stdout, cada desactivación de un test:
los marcadores `skip`, `skipif` y `xfail` (decorador o `pytestmark`), `pytest.skip(`, `pytest.xfail(`, `pytest.importorskip(`,
`pytest.skip.Exception` y los decoradores `unittest.skip*` / `unittest.expectedFailure`. Los nombres se resuelven contra los
`import` del módulo, así que `import pytest as pt`, `from pytest import mark, skip` o `import unittest as ut` también se
detectan. Es AST, no texto: un comentario, un docstring o un string con `pytest.skip(` no alerta, y un módulo fuera de
`tests/` no se examina. `quality.mjs` lo invoca y normaliza cada hallazgo (regla `tests-sin-desactivar`).

Uso: python -I scripts/quality/check-pytest-hygiene.py <directorio-raíz-de-tests>
"""

import ast
import json
import sys
from pathlib import Path
from typing import Any

REGLA = "tests-sin-desactivar"
# Nombre calificado → símbolo que se reporta.
PROHIBIDOS = {
    "pytest.mark.skip": "pytest.mark.skip",
    "pytest.mark.skipif": "pytest.mark.skipif",
    "pytest.mark.xfail": "pytest.mark.xfail",
    "pytest.skip": "pytest.skip(",
    "pytest.xfail": "pytest.xfail(",
    "pytest.importorskip": "pytest.importorskip(",
    "pytest.skip.Exception": "pytest.skip.Exception",
    "pytest.xfail.Exception": "pytest.xfail.Exception",
    "unittest.skip": "unittest.skip",
    "unittest.skipIf": "unittest.skipIf",
    "unittest.skipUnless": "unittest.skipUnless",
    "unittest.expectedFailure": "unittest.expectedFailure",
}
MODULOS_VIGILADOS = frozenset({"pytest", "unittest"})


def nombres_enlazados_a_pytest(arbol: ast.AST) -> dict[str, str]:
    """Nombre local → nombre calificado, para los `import` de pytest y unittest (alias incluidos)."""
    enlaces: dict[str, str] = {}
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            for alias in nodo.names:
                if alias.name.split(".")[0] in MODULOS_VIGILADOS:
                    enlaces[alias.asname or alias.name.split(".")[0]] = (
                        alias.name if alias.asname else alias.name.split(".")[0]
                    )
        elif isinstance(nodo, ast.ImportFrom) and nodo.module and nodo.level == 0:
            if nodo.module.split(".")[0] in MODULOS_VIGILADOS:
                for alias in nodo.names:
                    enlaces[alias.asname or alias.name] = f"{nodo.module}.{alias.name}"
    return enlaces


def _calificado(nodo: ast.expr, enlaces: dict[str, str]) -> str | None:
    if isinstance(nodo, ast.Name):
        return enlaces.get(nodo.id)
    if isinstance(nodo, ast.Attribute):
        base = _calificado(nodo.value, enlaces)
        return f"{base}.{nodo.attr}" if base else None
    return None


def hallazgos_de_modulo(arbol: ast.AST) -> list[tuple[int, str]]:
    """(línea, símbolo) de cada desactivación; de una cadena `a.b.c` solo cuenta el nodo más externo prohibido."""
    enlaces = nombres_enlazados_a_pytest(arbol)
    coincidencias = {
        nodo: PROHIBIDOS[calificado]
        for nodo in ast.walk(arbol)
        if isinstance(nodo, ast.Name | ast.Attribute)
        and (calificado := _calificado(nodo, enlaces)) in PROHIBIDOS
    }
    internos = {nodo.value for nodo in coincidencias if isinstance(nodo, ast.Attribute)}
    return sorted(
        {
            (nodo.lineno, simbolo)
            for nodo, simbolo in coincidencias.items()
            if nodo not in internos
        }
    )


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
