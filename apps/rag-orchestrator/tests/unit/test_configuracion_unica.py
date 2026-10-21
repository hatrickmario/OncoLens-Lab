"""Toda la configuración entra por `app/config/` (US-037 AC-1, AC-6; RN-22, RN-12)."""

import ast
from pathlib import Path

import pytest
import yaml

from app.config.settings import Settings
from app.config.version import VERSION_DEL_SERVICIO
from tests.support.contract import RAIZ_REPOSITORIO

APP = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator" / "app"
# Único lugar autorizado a leer el entorno: `app/config/`. Excepción acotada: las herramientas de MEDICIÓN de ADR-39
# (cachés, TMPDIR, contraseña de la medición), que no viajan en la imagen de producción. Cualquier otro script, y en
# particular los de operación (`load_seed_corpus`, `migrate_corpus_catalog`...), lee su configuración de `Settings`.
PERMITIDOS_MEDICION = (
    "scripts/adr39",
)  # prefijo: `adr39/`, `adr39_measure.py`, `adr39_fetch_sources.py`
CONFIG = "config/"
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


def _modulos(raiz: Path) -> list[Path]:
    return [
        ruta for ruta in sorted(raiz.rglob("*.py")) if "schemas/generated" not in ruta.as_posix()
    ]


def modulos_que_leen_el_entorno(raiz: Path) -> list[str]:
    relativas = {ruta: ruta.relative_to(raiz).as_posix() for ruta in _modulos(raiz)}
    return [
        rel
        for ruta, rel in relativas.items()
        if not rel.startswith((CONFIG, *PERMITIDOS_MEDICION))
        and lee_el_entorno(ruta.read_text(encoding="utf-8"))
    ]


def modulos_que_importan_scripts(raiz: Path) -> list[str]:
    infractores = []
    for ruta in _modulos(raiz):
        rel = ruta.relative_to(raiz).as_posix()
        if rel.startswith("scripts/"):
            continue
        for nodo in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
            nombres = []
            if isinstance(nodo, ast.Import):
                nombres = [a.name for a in nodo.names]
            elif isinstance(nodo, ast.ImportFrom):
                nombres = [nodo.module or "", *(f"{nodo.module}.{a.name}" for a in nodo.names)]
            if any(n == "app.scripts" or n.startswith("app.scripts.") for n in nombres):
                infractores.append(rel)
                break
    return infractores


@pytest.mark.ac("US-037", 1)
def test_ningun_modulo_del_servicio_lee_el_entorno_fuera_de_app_config():
    assert modulos_que_leen_el_entorno(APP) == []


def test_la_exclusion_solo_cubre_los_scripts_de_medicion_cuando_otro_script_lee_el_entorno(
    tmp_path,
):
    (tmp_path / "scripts" / "adr39").mkdir(parents=True)
    (tmp_path / "config").mkdir()
    lectura = "import os\nx = os.environ['A']\n"
    (tmp_path / "scripts" / "adr39_measure.py").write_text(lectura)
    (tmp_path / "scripts" / "adr39" / "cli.py").write_text(lectura)
    (tmp_path / "config" / "settings.py").write_text(lectura)
    (tmp_path / "scripts" / "load_otro.py").write_text(lectura)
    (tmp_path / "api.py").write_text(lectura)

    assert modulos_que_leen_el_entorno(tmp_path) == ["api.py", "scripts/load_otro.py"]


def test_ningun_modulo_fuera_de_app_scripts_importa_app_scripts():
    assert modulos_que_importan_scripts(APP) == []


def test_la_sonda_de_importacion_detecta_las_formas_de_importar_scripts(tmp_path):
    for nombre, fuente in {
        "a.py": "import app.scripts.load_seed_corpus",
        "b.py": "from app.scripts import init_corpus_store",
        "c.py": "from app.scripts.adr39 import cli",
        "ok.py": "from app.config import settings",
    }.items():
        (tmp_path / nombre).write_text(fuente)

    assert modulos_que_importan_scripts(tmp_path) == ["a.py", "b.py", "c.py"]


@pytest.mark.ac("US-037", 6)
def test_settings_sin_llm_cloud_enabled_valor_efectivo_false(monkeypatch):
    monkeypatch.delenv("LLM_CLOUD_ENABLED", raising=False)

    assert Settings(_env_file=None).llm_cloud_enabled is False


def test_service_version_coincide_con_la_version_del_contrato():
    spec = yaml.safe_load(Path(APP.parent / "openapi.yaml").read_text(encoding="utf-8"))

    assert VERSION_DEL_SERVICIO == spec["info"]["version"]
