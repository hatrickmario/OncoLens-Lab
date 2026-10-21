"""Plugin de Pytest de la CI (L1D-277, ARR-01 AC-3): resumen por criterio de aceptación.

Se carga con `-p resumen_por_ac` (PYTHONPATH apunta a este directorio). Por cada test con `@pytest.mark.ac(historia, n)`
imprime `AC <historia> AC-<n>: <resultado> (<test>)` y, si se define RESUMEN_AC_ARCHIVO, escribe el mismo resumen en
JSON (`{"US-058 AC-1": ["passed", ...]}`) para que el script de integración compruebe los AC requeridos. Solo lee los
marcadores y el resultado: nunca el cuerpo, las entradas ni la salida de un test.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict

_acs_por_test: dict[str, list[str]] = {}
_resultados: dict[str, list[tuple[str, str]]] = defaultdict(list)


def _clave(marca) -> str | None:
    if len(marca.args) < 2:
        return None
    return f"{marca.args[0]} AC-{marca.args[1]}"


def pytest_collection_modifyitems(items) -> None:
    for item in items:
        claves = [c for c in (_clave(m) for m in item.iter_markers("ac")) if c]
        if claves:
            _acs_por_test[item.nodeid] = claves


def pytest_runtest_logreport(report) -> None:
    # Un `setup` fallido o saltado también cuenta: un AC cuyo test no llegó a `call` no está en verde.
    if report.nodeid not in _acs_por_test:
        return
    if report.when == "call" or (report.when == "setup" and not report.passed):
        for clave in _acs_por_test[report.nodeid]:
            _resultados[clave].append((report.nodeid, report.outcome))


def pytest_terminal_summary(terminalreporter) -> None:
    terminalreporter.section("Resumen por AC (@pytest.mark.ac)")
    for clave in sorted(_resultados):
        for nodeid, resultado in _resultados[clave]:
            terminalreporter.write_line(f"{clave}: {resultado} ({nodeid})")
    destino = os.environ.get("RESUMEN_AC_ARCHIVO")
    if destino:
        resumen = {clave: [r for _, r in pares] for clave, pares in sorted(_resultados.items())}
        with open(destino, "w", encoding="utf-8") as archivo:
            json.dump(resumen, archivo, ensure_ascii=False, indent=2)
