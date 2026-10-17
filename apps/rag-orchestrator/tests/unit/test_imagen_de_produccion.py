"""La imagen de producción no lleva el código de medición (app/evaluation, app/scripts/adr39_*); la de medición sí.

Los scripts de operación (``migrate_corpus_catalog``, ``init_corpus_store``; US-058) viajan en la imagen: el one-shot
``corpus-migrate`` corre con ella."""

from __future__ import annotations

import ast
from fnmatch import fnmatchcase
from pathlib import Path

RAIZ_APP = Path(__file__).resolve().parents[2]
EXCLUIDOS = ("apps/rag-orchestrator/app/evaluation", "apps/rag-orchestrator/app/scripts/adr39_*.py")
PREFIJOS_DE_MEDICION = ("app.evaluation", "app.scripts.adr39_")
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
        return [nodo.module or "", *(f"{nodo.module}.{a.name}" for a in nodo.names)]
    paquete = ["app", *relativa[:-1]]
    base = paquete[: len(paquete) - (nodo.level - 1)]
    nombre = ".".join([*base, *([nodo.module] if nodo.module else [])])
    return [nombre, *(f"{nombre}.{a.name}" for a in nodo.names)]


def test_los_imports_relativos_a_evaluacion_o_scripts_se_resuelven_y_se_rechazan() -> None:
    nodo = ast.parse("from ..evaluation import fase_a").body[0]
    assert "app.evaluation.fase_a" in _modulos_absolutos(nodo, ("config", "x.py"))
    nodo = ast.parse("from . import scripts").body[0]
    assert "app.scripts" in _modulos_absolutos(nodo, ("x.py",))
    nodo = ast.parse("from app.scripts import adr39_measure").body[0]
    assert "app.scripts.adr39_measure" in _modulos_absolutos(nodo, ("x.py",))


def test_el_dockerignore_de_la_imagen_de_produccion_excluye_evaluacion_y_scripts_de_medicion() -> (
    None
):
    lineas = _lineas_del_dockerignore()

    assert all(excluido in lineas for excluido in EXCLUIDOS)


def _archivos_de_medicion() -> list[str]:
    """Rutas (desde la raíz del repo) del código de medición: ``app/evaluation/**`` y ``app/scripts/adr39_*.py``."""
    raiz = RAIZ_APP.parents[1]
    rutas = [
        *(RAIZ_APP / "app" / "evaluation").rglob("*.py"),
        *(RAIZ_APP / "app" / "scripts").glob("adr39_*.py"),
    ]
    return sorted(ruta.relative_to(raiz).as_posix() for ruta in rutas)


def _entrarian_a_la_imagen(patrones: list[str], archivos: list[str]) -> list[str]:
    """Archivos que ningún patrón del .dockerignore excluye (patrón de archivo, glob o directorio ancestro)."""
    lineas = [p.rstrip("/") for p in patrones]

    def excluido(archivo: str) -> bool:
        return any(fnmatchcase(archivo, p) or archivo.startswith(p + "/") for p in lineas)

    return [a for a in archivos if not excluido(a)]


def test_el_dockerignore_de_produccion_deja_fuera_todo_archivo_de_medicion_existente() -> None:
    archivos = _archivos_de_medicion()

    assert archivos and _entrarian_a_la_imagen(_patrones(DOCKERIGNORE), archivos) == []


def test_un_dockerignore_sin_el_patron_de_adr39_deja_entrar_los_scripts_de_medicion() -> None:
    sin_adr39 = [p for p in _patrones(DOCKERIGNORE) if "adr39_" not in p]

    entran = _entrarian_a_la_imagen(sin_adr39, _archivos_de_medicion())

    assert entran and all("/app/scripts/adr39_" in a for a in entran)


def test_un_dockerignore_sin_app_evaluation_deja_entrar_el_codigo_de_evaluacion() -> None:
    sin_evaluacion = [p for p in _patrones(DOCKERIGNORE) if not p.endswith("app/evaluation")]

    entran = _entrarian_a_la_imagen(sin_evaluacion, _archivos_de_medicion())

    assert entran and all("/app/evaluation/" in a for a in entran)


def test_un_senuelo_de_medicion_nuevo_entra_a_la_imagen_si_no_cae_bajo_un_patron_excluido() -> None:
    senuelo = "apps/rag-orchestrator/app/scripts/medir_otra_cosa.py"

    assert _entrarian_a_la_imagen(_patrones(DOCKERIGNORE), [senuelo]) == [senuelo]


def test_el_codigo_de_produccion_no_importa_evaluacion_ni_scripts_de_medicion() -> None:
    ofensores = []
    for ruta in (RAIZ_APP / "app").rglob("*.py"):
        relativa = ruta.relative_to(RAIZ_APP / "app").parts
        if relativa[0] == "evaluation" or relativa[-1].startswith("adr39_"):
            continue
        for nodo in ast.walk(ast.parse(ruta.read_text(encoding="utf-8"))):
            ofensores += [
                f"{ruta.name}: {m}"
                for m in _modulos_absolutos(nodo, relativa)
                if m.startswith(PREFIJOS_DE_MEDICION)
            ]

    assert ofensores == []


def test_la_imagen_de_medicion_no_copia_el_codigo_sino_que_lo_monta() -> None:
    dockerfile = (RAIZ_APP / "eval" / "configs" / "adr39-medicion.Dockerfile").read_text(
        encoding="utf-8"
    )

    assert "COPY app" not in dockerfile and "se monta en /work" in dockerfile
