"""Los marcadores de Pytest son estrictos (L1D-285, US-213 AC-9): un marcador mal escrito falla al recolectar.

`@pytest.mark.ac(...)` es lo que lee `check-ac-coverage`; si un typo (`acc`) pasara en silencio, el AC quedaría sin test de
aceptación aunque el desarrollador crea tenerlo. Se ejecuta un Pytest real contra un módulo temporal con la configuración
de rag-orchestrator y un tiempo máximo explícito.
"""

import subprocess
import sys
from pathlib import Path

import pytest

PYTEST_INI = Path(__file__).resolve().parents[2] / "pytest.ini"
TIEMPO_MAXIMO_S = 60


def _ejecutar_pytest(modulo: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-c",
            str(PYTEST_INI),
            "--rootdir",
            str(modulo.parent),
            str(modulo),
        ],
        capture_output=True,
        text=True,
        timeout=TIEMPO_MAXIMO_S,
        check=False,
    )


def _modulo_con_marcador(carpeta: Path, marcador: str) -> Path:
    modulo = carpeta / "test_temporal.py"
    lineas = [
        "import pytest",
        "",
        "",
        f"@pytest.mark.{marcador}",
        "def test_x():",
        "    assert 1 == 1",
    ]
    modulo.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    return modulo


@pytest.mark.ac("US-213", 9)
def test_marcadores_un_marcador_mal_escrito_falla_en_la_recoleccion(tmp_path: Path) -> None:
    resultado = _ejecutar_pytest(_modulo_con_marcador(tmp_path, 'acc("US-213", 9)'))

    assert resultado.returncode != 0
    assert (
        "'acc' not found in `markers` configuration option" in resultado.stdout + resultado.stderr
    )


def test_marcadores_el_marcador_ac_registrado_pasa_la_recoleccion(tmp_path: Path) -> None:
    resultado = _ejecutar_pytest(_modulo_con_marcador(tmp_path, 'ac("US-213", 9)'))

    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
