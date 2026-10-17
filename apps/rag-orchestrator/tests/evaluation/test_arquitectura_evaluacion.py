"""Dirección de las dependencias: ``app.scripts`` (CLI) depende de ``app.evaluation``, nunca al revés."""

from __future__ import annotations

import ast

from app.evaluation.rutas import raiz_repo

from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO


def _modulos_importados(ruta) -> set[str]:  # type: ignore[no-untyped-def]
    arbol = ast.parse(ruta.read_text(encoding="utf-8"))
    modulos: set[str] = set()
    for nodo in ast.walk(arbol):  # incluye importaciones dentro de funciones
        if isinstance(nodo, ast.Import):
            modulos.update(alias.name for alias in nodo.names)
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            modulos.add(nodo.module)
    return modulos


def test_ningun_modulo_de_evaluacion_importa_app_scripts() -> None:
    ofensores = {
        p.name: sorted(
            m for m in _modulos_importados(p) if m == "app.scripts" or m.startswith("app.scripts.")
        )
        for p in (RAIZ_APP / "app" / "evaluation").glob("*.py")
    }

    assert {k: v for k, v in ofensores.items() if v} == {}


def test_la_raiz_del_repo_es_una_sola_y_apunta_al_directorio_con_data_y_apps() -> None:
    assert raiz_repo() == RAIZ_REPO and (raiz_repo() / "data" / "eval").is_dir()
