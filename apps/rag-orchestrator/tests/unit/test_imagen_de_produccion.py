"""La imagen de producción no lleva el código de medición (app/evaluation, app/scripts); la de medición sí."""

from __future__ import annotations

import ast
from pathlib import Path

RAIZ_APP = Path(__file__).resolve().parents[2]
EXCLUIDOS = ("apps/rag-orchestrator/app/evaluation", "apps/rag-orchestrator/app/scripts")
DOCKERIGNORE = RAIZ_APP / "Dockerfile.dockerignore"
DOCKERIGNORE_RAIZ = RAIZ_APP.parents[1] / ".dockerignore"


def _patrones(ruta: Path) -> list[str]:
    if not ruta.exists():
        return []
    return [
        linea.strip()
        for linea in ruta.read_text(encoding="utf-8").splitlines()
        if linea.strip() and not linea.startswith("#")
    ]


def _lineas_del_dockerignore() -> list[str]:
    return [linea.rstrip("/") for linea in _patrones(DOCKERIGNORE)]


def test_el_dockerignore_especifico_repite_todos_los_patrones_del_dockerignore_de_la_raiz() -> None:
    """BuildKit usa <Dockerfile>.dockerignore EN LUGAR del .dockerignore raíz: sin copiarlos, vuelven los secretos al contexto (RN-14)."""
    faltantes = [p for p in _patrones(DOCKERIGNORE_RAIZ) if p not in _patrones(DOCKERIGNORE)]

    assert _patrones(DOCKERIGNORE_RAIZ) and faltantes == []


def _modulos_absolutos(nodo: ast.AST, relativa: tuple[str, ...]) -> list[str]:
    """Módulos importados por el nodo, con los imports relativos (level > 0) resueltos contra el paquete del archivo."""
    if isinstance(nodo, ast.Import):
        return [a.name for a in nodo.names]
    if not isinstance(nodo, ast.ImportFrom):
        return []
    if nodo.level == 0:
        return [nodo.module or ""]
    paquete = ["app", *relativa[:-1]]
    base = paquete[: len(paquete) - (nodo.level - 1)]
    nombre = ".".join([*base, *([nodo.module] if nodo.module else [])])
    return [nombre, *(f"{nombre}.{a.name}" for a in nodo.names)]


def test_los_imports_relativos_a_evaluacion_o_scripts_se_resuelven_y_se_rechazan() -> None:
    nodo = ast.parse("from ..evaluation import fase_a").body[0]
    assert "app.evaluation.fase_a" in _modulos_absolutos(nodo, ("config", "x.py"))
    nodo = ast.parse("from . import scripts").body[0]
    assert "app.scripts" in _modulos_absolutos(nodo, ("x.py",))


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
            ofensores += [
                f"{ruta.name}: {m}"
                for m in _modulos_absolutos(nodo, relativa)
                if m.startswith(("app.evaluation", "app.scripts"))
            ]

    assert ofensores == []


def test_la_imagen_de_medicion_no_copia_el_codigo_sino_que_lo_monta() -> None:
    dockerfile = (RAIZ_APP / "eval" / "configs" / "adr39-medicion.Dockerfile").read_text(
        encoding="utf-8"
    )

    assert "COPY app" not in dockerfile and "se monta en /work" in dockerfile
