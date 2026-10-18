"""Verificación del proveedor [S1 resp. 17]: valida el cuerpo de una respuesta contra el spec empaquetado.

El spec lo empaqueta `node scripts/contracts/bundle-json.mjs rag-orchestrator` (a stdout, sin escribir en
el repositorio) y lo entrega el fixture de sesión de `conftest.py`. Es el equivalente en Pytest de
`scripts/contracts/lib/responseValidator.mjs`; lo reemplaza `contracts:verify-provider` (US-214).
"""

import json
import subprocess
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

RAIZ_REPOSITORIO = Path(__file__).resolve().parents[4]
CATALOGOS = RAIZ_REPOSITORIO / "packages" / "clinical-catalogs"
PROVEEDOR = "rag-orchestrator"

_spec: dict[str, Any] | None = None


def empaquetar_spec() -> dict[str, Any]:
    """Ejecuta el empaquetador de contratos y devuelve el spec con los schemas compartidos."""
    salida = subprocess.run(
        ["node", str(RAIZ_REPOSITORIO / "scripts/contracts/bundle-json.mjs"), PROVEEDOR],
        check=True,
        capture_output=True,
        cwd=RAIZ_REPOSITORIO,
    )
    return json.loads(salida.stdout)


def usar_spec(spec: dict[str, Any]) -> None:
    """Fija el spec de la sesión (lo llama el fixture de `conftest.py`)."""
    global _spec
    _spec = spec


def _segmentos(pointer: str) -> list[str]:
    return [
        s.replace("~1", "/").replace("~0", "~") for s in pointer.removeprefix("#/").split("/") if s
    ]


def _seguir_ref(spec: dict[str, Any], nodo: Any) -> Any:
    while (
        isinstance(nodo, dict)
        and isinstance(nodo.get("$ref"), str)
        and nodo["$ref"].startswith("#/")
    ):
        nodo = _resolver(spec, nodo["$ref"])
    return nodo


def _resolver(spec: dict[str, Any], pointer: str) -> Any:
    nodo: Any = spec
    for segmento in _segmentos(pointer):
        nodo = _seguir_ref(spec, nodo)
        if not isinstance(nodo, dict) or segmento not in nodo:
            raise AssertionError(f"el destino {pointer} no existe en el spec de {PROVEEDOR}")
        nodo = nodo[segmento]
    return nodo


def _schema_de(spec: dict[str, Any], pointer: str) -> dict[str, Any]:
    destino = _seguir_ref(spec, _resolver(spec, pointer))
    if isinstance(destino, dict) and "content" in destino:
        destino = destino["content"]["application/json"]["schema"]
    return destino


def assert_matches_spec(pointer: str, body: Any) -> None:
    """Falla nombrando cada campo incumplido si `body` no cumple el schema de `pointer`.

    `pointer`: `#/components/schemas/<Nombre>` o `#/paths/<ruta>/<método>/responses/<código>`.
    """
    if _spec is None:
        raise RuntimeError("spec no configurado: usa el fixture de sesión de conftest.py")
    raiz = {**_schema_de(_spec, pointer), "components": _spec["components"]}
    errores = sorted(
        Draft202012Validator(raiz).iter_errors(body), key=lambda e: list(e.absolute_path)
    )
    if errores:
        detalle = "\n".join(
            f"  /{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errores
        )
        raise AssertionError(f"la respuesta no cumple {PROVEEDOR}{pointer}:\n{detalle}")


def operaciones_con_jwt_de_servicio() -> list[tuple[str, str]]:
    """(método, ruta) de cada operación del spec con `security: serviceJwt` (la global, salvo `security: []`)."""
    if _spec is None:
        raise RuntimeError("spec no configurado: usa el fixture de sesión de conftest.py")
    global_requiere = {"serviceJwt"} <= {n for req in _spec.get("security", []) for n in req}
    protegidas = []
    for ruta, operaciones in _spec["paths"].items():
        for metodo, operacion in operaciones.items():
            seguridad = operacion.get("security")
            requiere = (
                global_requiere
                if seguridad is None
                else any("serviceJwt" in req for req in seguridad)
            )
            if requiere:
                protegidas.append((metodo.upper(), ruta))
    return protegidas
