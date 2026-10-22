"""Una sola fuente por regla o vocabulario (Gate 2: hallazgos Mayores 1 y 2 de design-principles-reviewer)."""

from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest

from app.config.settings import HOSTS_LOCALES_DEL_LLM
from app.domain.reglas_proveedor import HOSTS_LOCALES
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

EVALUACION = RAIZ_APP / "app" / "evaluation"
CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"


def literales(ruta: Path) -> set[str]:
    """Cadenas del código de ``ruta``, sin docstrings."""
    arbol = ast.parse(ruta.read_text(encoding="utf-8"))
    docstrings = {
        id(nodo.body[0].value)
        for nodo in ast.walk(arbol)
        if isinstance(nodo, (ast.Module, ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef))
        and nodo.body
        and isinstance(nodo.body[0], ast.Expr)
        and isinstance(nodo.body[0].value, ast.Constant)
    }
    return {
        n.value
        for n in ast.walk(arbol)
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and id(n) not in docstrings
    }


def test_los_hosts_locales_por_defecto_del_llm_salen_de_la_lista_cerrada_del_dominio() -> None:
    assert set(HOSTS_LOCALES_DEL_LLM) == set(HOSTS_LOCALES)


def test_las_fuentes_excluidas_se_definen_solo_en_el_dominio_del_corpus() -> None:
    repetidas = {p.name: sorted(literales(p) & {"NCCN", "ESMO"}) for p in EVALUACION.glob("*.py")}

    assert {k: v for k, v in repetidas.items() if v} == {}


def test_el_esquema_de_la_suite_deriva_sus_vocabularios_cerrados_de_sus_fuentes() -> None:
    vocabularios = {
        "sintetico",
        "real_anonimizado",
        "fake",
        "local",
        "simulado",
        "real",
        "validada",
        "no_validada",
        "retrieval",
        "generation",
        "all",
    }

    assert literales(EVALUACION / "esquema_suite.py") & vocabularios == set()


@pytest.mark.parametrize("suite", ["all", "retrieval", "generation"])
def test_el_resultado_de_cada_familia_no_pisa_el_de_otra_con_la_misma_configuracion(
    tmp_path: Path, suite: str
) -> None:
    main(["--config", str(CONFIG), "--suite", suite, "--salida", str(tmp_path)], reloj=RelojFijo())

    nombre = next(tmp_path.glob("*.json")).name
    hash_config = json.loads(next(tmp_path.glob("*.json")).read_text())["configuracion"][
        "hashConfig"
    ]
    esperado = f"2026-10-16-{hash_config}" + ("" if suite == "all" else f"-{suite}") + ".json"
    assert nombre == esperado
