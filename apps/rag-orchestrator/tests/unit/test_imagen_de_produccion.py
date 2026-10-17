"""La imagen de producción no lleva el código de medición (app/evaluation, app/scripts/adr39_*); la de medición sí.

Los scripts de operación (``migrate_corpus_catalog``, ``init_corpus_store``; US-058) viajan en la imagen: el one-shot
``corpus-migrate`` corre con ella."""

from __future__ import annotations

import ast
import re
from pathlib import Path

RAIZ_APP = Path(__file__).resolve().parents[2]
PREFIJO_REPO = "apps/rag-orchestrator"
# Lista blanca: lo único de app/scripts que viaja en la imagen de producción (el one-shot corpus-migrate y el inicializador).
SCRIPTS_DE_OPERACION = (
    "migrate_corpus_catalog.py",
    "init_corpus_store.py",
    "load_seed_corpus.py",
    "__init__.py",
)
PREFIJOS_DE_MEDICION = (
    "app.evaluation",
    "app.scripts.adr39_",
)  # imports prohibidos en código de producción
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


def _regex_de_patron(patron: str) -> re.Pattern[str]:
    """Glob de .dockerignore: ``*`` y ``?`` no cruzan ``/`` (a diferencia de fnmatch); ``**`` sí."""
    partes = []
    for fragmento in re.split(r"(\*\*|\*|\?)", patron.rstrip("/")):
        partes.append(
            {"**": ".*", "*": "[^/]*", "?": "[^/]"}.get(fragmento) or re.escape(fragmento)
        )
    return re.compile("".join(partes))


def _coincide(patron: str, archivo: str) -> bool:
    """Un patrón casa con el archivo o con alguno de sus directorios ancestros."""
    regex = _regex_de_patron(patron)
    partes = archivo.split("/")
    return any(regex.fullmatch("/".join(partes[: n + 1])) for n in range(len(partes)))


def _entrarian_a_la_imagen(patrones: list[str], archivos: list[str]) -> list[str]:
    """Archivos que el .dockerignore deja entrar. Como Docker: gana el ÚLTIMO patrón que casa y ``!`` lo reincorpora."""
    entran = []
    for archivo in archivos:
        excluido = False
        for patron in patrones:
            negado = patron.startswith("!")
            if _coincide(patron.removeprefix("!"), archivo):
                excluido = not negado
        if not excluido:
            entran.append(archivo)
    return entran


def _archivos_reales(subdirectorio: str) -> list[str]:
    raiz = RAIZ_APP.parents[1]
    return sorted(
        ruta.relative_to(raiz).as_posix()
        for ruta in (RAIZ_APP / "app" / subdirectorio).rglob("*")
        if ruta.is_file()
    )


RUTA_SCRIPTS = f"{PREFIJO_REPO}/app/scripts"
SENUELOS_DE_MEDICION = [
    f"{RUTA_SCRIPTS}/ADR39_mayus.py",
    f"{RUTA_SCRIPTS}/adr39_sub/medir.py",
    f"{RUTA_SCRIPTS}/data/muestra.json",
    f"{RUTA_SCRIPTS}/reporte_adr39.json",
    f"{RUTA_SCRIPTS}/medir_otra_cosa.py",
    f"{PREFIJO_REPO}/app/evaluation/nuevo_modulo.py",
]


def test_la_imagen_de_produccion_solo_lleva_de_app_scripts_los_scripts_de_operacion() -> None:
    patrones = _patrones(DOCKERIGNORE)
    archivos = _archivos_reales("scripts")

    entran = _entrarian_a_la_imagen(patrones, archivos)

    assert {a.rsplit("/", 1)[1] for a in archivos} > set(
        SCRIPTS_DE_OPERACION
    )  # hay scripts de medición que excluir
    assert sorted(a.rsplit("/", 1)[1] for a in entran) == sorted(SCRIPTS_DE_OPERACION)


def test_la_imagen_de_produccion_deja_fuera_todo_app_evaluation() -> None:
    archivos = _archivos_reales("evaluation")

    assert archivos and _entrarian_a_la_imagen(_patrones(DOCKERIGNORE), archivos) == []


def test_ningun_senuelo_de_medicion_entra_a_la_imagen_aunque_se_llame_distinto_o_viva_en_un_subdirectorio() -> (
    None
):
    assert _entrarian_a_la_imagen(_patrones(DOCKERIGNORE), SENUELOS_DE_MEDICION) == []


def test_un_dockerignore_con_exclusion_por_nombre_deja_entrar_los_senuelos() -> None:
    """Prueba en rojo del evaluador: la versión anterior (solo ``adr39_*.py``) dejaba entrar medir_otra_cosa.py y más."""
    por_nombre = [p for p in _patrones(DOCKERIGNORE) if not p.startswith(("!", RUTA_SCRIPTS))]
    por_nombre.append(f"{RUTA_SCRIPTS}/adr39_*.py")

    entran = _entrarian_a_la_imagen(por_nombre, SENUELOS_DE_MEDICION)

    assert f"{RUTA_SCRIPTS}/medir_otra_cosa.py" in entran
    assert f"{RUTA_SCRIPTS}/adr39_sub/medir.py" in entran
    assert f"{RUTA_SCRIPTS}/reporte_adr39.json" in entran


def test_un_dockerignore_sin_app_evaluation_deja_entrar_el_codigo_de_evaluacion() -> None:
    sin_evaluacion = [p for p in _patrones(DOCKERIGNORE) if not p.endswith("app/evaluation")]

    assert _entrarian_a_la_imagen(sin_evaluacion, _archivos_reales("evaluation"))


def test_el_codigo_de_produccion_no_importa_evaluacion_ni_scripts_de_medicion() -> None:
    ofensores = []
    for ruta in (RAIZ_APP / "app").rglob("*.py"):
        relativa = ruta.relative_to(RAIZ_APP / "app").parts
        if relativa[0] == "evaluation" or (
            relativa[0] == "scripts" and relativa[-1] not in SCRIPTS_DE_OPERACION
        ):
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
