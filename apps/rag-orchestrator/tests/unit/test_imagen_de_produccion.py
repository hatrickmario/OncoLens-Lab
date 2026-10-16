"""La imagen de producción no lleva el código de medición (app/evaluation, app/scripts); la de medición sí."""

from __future__ import annotations

import ast
from pathlib import Path

RAIZ_APP = Path(__file__).resolve().parents[2]
EXCLUIDOS = ("apps/rag-orchestrator/app/evaluation", "apps/rag-orchestrator/app/scripts")
DOCKERIGNORE = RAIZ_APP / "Dockerfile.dockerignore"


def _lineas_del_dockerignore() -> list[str]:
    if not DOCKERIGNORE.exists():
        return []
    return [linea.strip().rstrip("/") for linea in DOCKERIGNORE.read_text(encoding="utf-8").splitlines() if linea.strip() and not linea.startswith("#")]


def test_el_dockerignore_de_la_imagen_de_produccion_excluye_evaluacion_y_scripts() -> None:
    lineas = _lineas_del_dockerignore()

    assert all(excluido in lineas for excluido in EXCLUIDOS)


def test_el_codigo_de_produccion_no_importa_evaluacion_ni_scripts() -> None:
    ofensores = []
    for ruta in (RAIZ_APP / "app").rglob("*.py"):
        relativa = ruta.relative_to(RAIZ_APP / "app").parts
        if relativa[0] in ("evaluation", "scripts"):
            continue
        for nodo in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
            modulos = [a.name for a in nodo.names] if isinstance(nodo, ast.Import) else [nodo.module or ""] if isinstance(nodo, ast.ImportFrom) else []
            ofensores += [f"{ruta.name}: {m}" for m in modulos if m.startswith(("app.evaluation", "app.scripts"))]

    assert ofensores == []


def test_la_imagen_de_medicion_no_copia_el_codigo_sino_que_lo_monta() -> None:
    dockerfile = (RAIZ_APP / "eval" / "configs" / "adr39-medicion.Dockerfile").read_text(encoding="utf-8")

    assert "COPY app" not in dockerfile and "se monta en /work" in dockerfile
