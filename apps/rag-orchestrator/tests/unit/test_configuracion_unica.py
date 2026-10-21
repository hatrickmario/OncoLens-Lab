"""Toda la configuración entra por `app/config/` (US-037 AC-1, AC-6; RN-22, RN-12)."""

import ast
from pathlib import Path

import pytest
import yaml

from app.config.settings import Settings
from app.config.version import VERSION_DEL_SERVICIO
from tests.support.contract import RAIZ_REPOSITORIO

APP = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator" / "app"
# Único lugar autorizado a leer el entorno, más las herramientas de línea de comandos (`python -m app.scripts...`),
# que son del desarrollador (cachés, TMPDIR, contraseña de la medición) y no forman parte del servicio.
PERMITIDOS = (APP / "config", APP / "scripts")
LECTURAS_DEL_ENTORNO = {"environ", "getenv", "getenvb", "putenv"}


def lee_el_entorno(fuente: str) -> bool:
    """True si el código importa o usa `os.environ`/`os.getenv` (incluida la forma `from os import environ`)."""
    for nodo in ast.walk(ast.parse(fuente)):
        if isinstance(nodo, ast.Attribute) and nodo.attr in LECTURAS_DEL_ENTORNO:
            return True
        importa_de_os = isinstance(nodo, ast.ImportFrom) and nodo.module == "os"
        if importa_de_os and any(a.name in LECTURAS_DEL_ENTORNO for a in nodo.names):
            return True
    return False


@pytest.mark.parametrize(
    "fuente",
    [
        "import os\nx = os.environ['A']",
        "import os\nx = os.environ.get('A')",
        "import os\nx = os.getenv('A')",
        "from os import environ\nx = environ['A']",
        "from os import getenv as leer\nx = leer('A')",
    ],
)
def test_detector_encuentra_la_lectura_del_entorno_cuando_el_codigo_la_hace(fuente):
    # Sonda de mutación del test estático: si el detector dejara de ver estos casos, el test del árbol sería ciego.
    assert lee_el_entorno(fuente)


def test_detector_no_marca_codigo_que_no_lee_el_entorno():
    assert not lee_el_entorno("import os\nx = os.path.join('a', 'b')\nenviron = {}")


@pytest.mark.ac("US-037", 1)
def test_ningun_modulo_del_servicio_lee_el_entorno_fuera_de_app_config():
    infractores = [
        str(ruta.relative_to(APP))
        for ruta in sorted(APP.rglob("*.py"))
        if not any(carpeta in ruta.parents for carpeta in PERMITIDOS)
        and "schemas/generated" not in ruta.as_posix()
        and lee_el_entorno(ruta.read_text(encoding="utf-8"))
    ]

    assert infractores == []


@pytest.mark.ac("US-037", 6)
def test_settings_sin_llm_cloud_enabled_valor_efectivo_false(monkeypatch):
    monkeypatch.delenv("LLM_CLOUD_ENABLED", raising=False)

    assert Settings(_env_file=None).llm_cloud_enabled is False


def test_service_version_coincide_con_la_version_del_contrato():
    spec = yaml.safe_load(Path(APP.parent / "openapi.yaml").read_text(encoding="utf-8"))

    assert VERSION_DEL_SERVICIO == spec["info"]["version"]
