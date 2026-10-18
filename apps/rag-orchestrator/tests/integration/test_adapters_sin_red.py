"""Los adapters reales funcionan sin red y no importan clientes de nube o HTTP (US-231a AC-8, RN-12, NFR-05).

El bloqueo de sockets registra cada intento de conexión: con los cuatro adapters en marcha el registro debe quedar vacío.
"""

from __future__ import annotations

import ast
import socket
from pathlib import Path

import pytest

from tests.support.modelos import (
    RAIZ_APP,
    cargar_modelos_reales,
    construir_modelos_con_dobles,
    crear_entorno_de_modelos,
    ejercitar_el_nli,
    ejercitar_los_cuatro_adapters,
)

RAIZ_APP_CODIGO = RAIZ_APP / "app"
PAQUETES_DE_ADAPTERS = ("embeddings", "reranker", "language", "models", "nli")
IMPORTS_PROHIBIDOS = (
    "huggingface_hub",
    "transformers",
    "requests",
    "httpx",
    "urllib.request",
    "socket",
    "boto3",
    "botocore",
    "google.cloud",
    "azure",
    "openai",
    "anthropic",
)
NOMBRES_PROHIBIDOS = ("from_pretrained", "hf_hub_download")


class RedBloqueada:
    """Sustituye las primitivas de conexión de ``socket`` y apunta cada intento (sin dejar salir ninguno)."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.intentos: list[str] = []
        for nombre in ("connect", "connect_ex"):
            monkeypatch.setattr(socket.socket, nombre, self._bloquear(f"socket.{nombre}"))
        for nombre in ("create_connection", "getaddrinfo", "gethostbyname"):
            monkeypatch.setattr(socket, nombre, self._bloquear(f"socket.{nombre}"))

    def _bloquear(self, nombre: str):
        def bloqueado(*_args: object, **_kwargs: object):
            self.intentos.append(nombre)
            raise OSError("red bloqueada por el test")

        return bloqueado


@pytest.fixture
def red_bloqueada(monkeypatch: pytest.MonkeyPatch) -> RedBloqueada:
    return RedBloqueada(monkeypatch)


@pytest.mark.ac("US-231a", 8)
def test_los_cuatro_adapters_responden_con_la_red_bloqueada_y_sin_conexiones_salientes(
    tmp_path: Path, red_bloqueada: RedBloqueada
) -> None:
    modelos = construir_modelos_con_dobles(crear_entorno_de_modelos(tmp_path / "modelos"))

    ejercitar_los_cuatro_adapters(modelos)

    assert red_bloqueada.intentos == []


@pytest.mark.models
@pytest.mark.ac("US-231a", 8)
def test_los_cuatro_adapters_con_pesos_reales_responden_con_la_red_bloqueada(
    red_bloqueada: RedBloqueada,
) -> None:
    modelos = cargar_modelos_reales()

    ejercitar_los_cuatro_adapters(modelos)

    assert red_bloqueada.intentos == []


def _archivos(paquetes: tuple[str, ...]) -> list[Path]:
    return sorted(
        archivo
        for paquete in paquetes
        for archivo in (RAIZ_APP_CODIGO / "infrastructure" / paquete).rglob("*.py")
    )


def _modulos_importados(arbol: ast.AST) -> set[str]:
    modulos: set[str] = set()
    for nodo in ast.walk(arbol):
        if isinstance(nodo, ast.Import):
            modulos |= {alias.name for alias in nodo.names}
        elif isinstance(nodo, ast.ImportFrom) and nodo.module:
            modulos.add(nodo.module)
            modulos |= {f"{nodo.module}.{alias.name}" for alias in nodo.names}
    return modulos


def _es_prohibido(modulo: str) -> bool:
    return any(modulo == p or modulo.startswith(f"{p}.") for p in IMPORTS_PROHIBIDOS)


@pytest.mark.ac("US-231a", 8)
def test_ningun_modulo_de_los_adapters_importa_ni_usa_un_cliente_de_nube_o_http() -> None:
    archivos = _archivos(PAQUETES_DE_ADAPTERS)
    assert archivos, "la inspección no encontró ningún módulo de los adapters"
    infracciones: list[str] = []
    for archivo in archivos:
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        infracciones += [
            f"{archivo.name}: importa {m}" for m in _modulos_importados(arbol) if _es_prohibido(m)
        ]
        infracciones += [
            f"{archivo.name}: usa {nodo.attr if isinstance(nodo, ast.Attribute) else nodo.id}"
            for nodo in ast.walk(arbol)
            if (isinstance(nodo, ast.Attribute) and nodo.attr in NOMBRES_PROHIBIDOS)
            or (isinstance(nodo, ast.Name) and nodo.id in NOMBRES_PROHIBIDOS)
        ]

    assert infracciones == []


@pytest.mark.ac("US-231a", 8)
def test_la_carga_usa_tokenizer_from_file_e_inference_session_con_rutas_locales() -> None:
    codigo = (RAIZ_APP_CODIGO / "infrastructure" / "models" / "onnx.py").read_text(encoding="utf-8")
    llamadas = {
        ast.unparse(nodo.func): ast.unparse(nodo.args[0])
        for nodo in ast.walk(ast.parse(codigo))
        if isinstance(nodo, ast.Call) and nodo.args
    }

    assert llamadas["Tokenizer.from_file"] == "str(ruta)"
    # US-231b D12: la sesión se crea desde los bytes ya hasheados, no desde una ruta sin verificar.
    assert llamadas["ort.InferenceSession"] == "contenido"


@pytest.mark.ac("US-231b", 5)
def test_el_nli_clasifica_los_pares_de_fx06ac_con_la_red_bloqueada_y_sin_conexiones_salientes(
    tmp_path: Path, red_bloqueada: RedBloqueada
) -> None:
    modelos = construir_modelos_con_dobles(crear_entorno_de_modelos(tmp_path / "modelos"))

    ejercitar_el_nli(modelos)

    assert red_bloqueada.intentos == []


@pytest.mark.models
@pytest.mark.ac("US-231b", 5)
def test_el_nli_con_pesos_reales_clasifica_con_la_red_bloqueada_y_sin_conexiones_salientes(
    red_bloqueada: RedBloqueada,
) -> None:
    modelos = cargar_modelos_reales()

    ejercitar_el_nli(modelos)

    assert red_bloqueada.intentos == []


@pytest.mark.ac("US-231b", 5)
def test_ningun_modulo_del_paquete_nli_importa_un_cliente_de_nube_o_http_ni_usa_from_pretrained() -> (
    None
):
    archivos = _archivos(("nli",))
    assert archivos, "la inspección no encontró ningún módulo del paquete nli"
    infracciones: list[str] = []
    for archivo in archivos:
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        infracciones += [
            f"{archivo.name}: importa {m}" for m in _modulos_importados(arbol) if _es_prohibido(m)
        ]
        infracciones += [
            f"{archivo.name}: usa {nodo.attr if isinstance(nodo, ast.Attribute) else nodo.id}"
            for nodo in ast.walk(arbol)
            if (isinstance(nodo, ast.Attribute) and nodo.attr in NOMBRES_PROHIBIDOS)
            or (isinstance(nodo, ast.Name) and nodo.id in NOMBRES_PROHIBIDOS)
        ]

    assert infracciones == []


@pytest.mark.ac("US-231b", 4)
def test_ningun_modulo_del_paquete_nli_lee_config_json_ni_id2label() -> None:
    """El mapeo de clases viene de la configuración versionada: un config.json sin verificar lo invertiría (RN-01)."""
    prohibidos = ("config.json", "id2label", "label2id")
    infracciones: list[str] = []
    for archivo in _archivos(("nli",)):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        docstrings = {
            id(nodo.body[0].value)
            for nodo in ast.walk(arbol)
            if isinstance(nodo, (ast.Module, ast.ClassDef, ast.FunctionDef))
            and nodo.body
            and isinstance(nodo.body[0], ast.Expr)
            and isinstance(nodo.body[0].value, ast.Constant)
        }
        infracciones += [
            f"{archivo.name}: {nodo.value}"
            for nodo in ast.walk(arbol)
            if isinstance(nodo, ast.Constant)
            and isinstance(nodo.value, str)
            and id(nodo) not in docstrings
            and any(p in nodo.value for p in prohibidos)
        ]
        infracciones += [
            f"{archivo.name}: usa {nodo.attr}"
            for nodo in ast.walk(arbol)
            if isinstance(nodo, ast.Attribute) and nodo.attr in prohibidos
        ]

    assert infracciones == []


def test_ningun_modulo_de_app_fuera_de_la_medicion_importa_huggingface_hub_ni_transformers() -> (
    None
):
    infracciones: list[str] = []
    for archivo in sorted(RAIZ_APP_CODIGO.rglob("*.py")):
        if "evaluation" in archivo.relative_to(RAIZ_APP_CODIGO).parts:
            continue  # código de medición de ADR-39: no viaja en la imagen de producción
        importados = _modulos_importados(ast.parse(archivo.read_text(encoding="utf-8")))
        infracciones += [
            f"{archivo.relative_to(RAIZ_APP_CODIGO)}: importa {m}"
            for m in importados
            if m.split(".")[0] in {"huggingface_hub", "transformers"}
        ]

    assert infracciones == []
