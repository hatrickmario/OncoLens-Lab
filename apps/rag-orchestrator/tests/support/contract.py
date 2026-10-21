"""Verificación del proveedor [S1 resp. 17, US-214]: valida respuestas contra el spec empaquetado.

El spec lo empaqueta `node scripts/contracts/bundle-json.mjs rag-orchestrator` (a stdout, sin escribir en
el repositorio) y lo entrega el fixture de sesión de `conftest.py`. Es el equivalente en Pytest de
`scripts/contracts/lib/responseValidator.mjs`. `verificar_respuesta` la llama el hook de
`verificacion_proveedor.py` con cada respuesta; `assert_matches_spec` queda para cuerpos que no son una
respuesta de rag-orchestrator (por ejemplo, un ejemplo de `contracts/examples/`).

Diferencias de paridad con el verificador JS, declaradas (deuda: vectores dorados comunes en `contracts/`,
ver design-principles lote R6): aquí no se elige la plantilla más específica cuando dos coinciden;
los formatos se validan con el `FORMAT_CHECKER` de jsonschema (sin `date-time`, que exige una dependencia
extra) y no con ajv-formats. Ningún mensaje imprime valores: solo método, plantilla, código y ruta JSON (RN-10).
"""

import json
import re
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
    try:
        salida = subprocess.run(
            ["node", str(RAIZ_REPOSITORIO / "scripts/contracts/bundle-json.mjs"), PROVEEDOR],
            check=True,
            capture_output=True,
            cwd=RAIZ_REPOSITORIO,
        )
    except subprocess.CalledProcessError as fallo:
        stderr = fallo.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"no se pudo empaquetar el spec de {PROVEEDOR}: {stderr}") from fallo
    return json.loads(salida.stdout)


def usar_spec(spec: dict[str, Any] | None) -> None:
    """Fija el spec de la sesión (`None` lo deja para empaquetarse en el primer uso)."""
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


def _spec_configurado() -> dict[str, Any]:
    """El spec de la sesión, empaquetado en el primer uso: los tests de dominio puro no invocan node."""
    global _spec
    if _spec is None:
        _spec = empaquetar_spec()
    return _spec


def _incumplimientos(spec: dict[str, Any], schema: dict[str, Any], cuerpo: Any) -> list[Any]:
    """Errores de `cuerpo` contra `schema` (con los componentes del spec), ordenados por ruta JSON."""
    validador = Draft202012Validator(
        {**schema, "components": spec["components"]},
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )
    return sorted(validador.iter_errors(cuerpo), key=lambda e: list(e.absolute_path))


def assert_matches_spec(pointer: str, body: Any) -> None:
    """Falla nombrando cada campo incumplido si `body` no cumple el schema de `pointer`.

    `pointer`: `#/components/schemas/<Nombre>` o `#/paths/<ruta>/<método>/responses/<código>`.
    """
    spec = _spec_configurado()
    errores = _incumplimientos(spec, _schema_de(spec, pointer), body)
    if errores:
        detalle = "\n".join(f"  {_describir_incumplimiento(e)}" for e in errores)
        raise AssertionError(f"la respuesta no cumple {PROVEEDOR}{pointer}:\n{detalle}")


def operaciones_con_jwt_de_servicio() -> list[tuple[str, str]]:
    """(método, ruta) de cada operación del spec con `security: serviceJwt` (la global, salvo `security: []`)."""
    spec = _spec_configurado()
    global_requiere = {"serviceJwt"} <= {n for req in spec.get("security", []) for n in req}
    protegidas = []
    for ruta, operaciones in spec["paths"].items():
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


def resolver_plantilla(spec: dict[str, Any], ruta: str) -> str | None:
    """Plantilla del spec (`/a/{id}`) que corresponde a la ruta concreta, o `None` si no hay."""
    if ruta in spec["paths"]:
        return ruta
    for plantilla in spec["paths"]:
        patron = "^" + re.sub(r"\\\{[^/}]+\\\}", "[^/]+", re.escape(plantilla)) + "$"
        if re.match(patron, ruta):
            return plantilla
    return None


def _ruta_sin_valores(spec: dict[str, Any], ruta: str) -> str:
    """Ruta sin query ni fragmento y con `{…}` en todo segmento que no sea un literal del spec (RN-10)."""
    literales = {
        segmento
        for plantilla in spec["paths"]
        for segmento in plantilla.split("/")
        if segmento and not segmento.startswith("{")
    }
    segmentos = re.split(r"[?#]", ruta, maxsplit=1)[0].split("/")
    return "/".join(s if s == "" or s in literales else "{…}" for s in segmentos)


def _respuesta_declarada(declaradas: dict[str, Any], status: int) -> dict[str, Any] | None:
    """La respuesta del spec para `status`: código exacto, rango `NXX` o `default`, en ese orden."""
    for clave in (str(status), f"{str(status)[0]}XX", "default"):
        if clave in declaradas:
            return declaradas[clave]
    return None


def _cabeceras_obligatorias(spec: dict[str, Any], respuesta: dict[str, Any]) -> list[str]:
    declaradas = _seguir_ref(spec, respuesta).get("headers", {})
    return [
        nombre
        for nombre, cabecera in declaradas.items()
        if _seguir_ref(spec, cabecera).get("required") is True
    ]


def _describir_incumplimiento(error: Any) -> str:
    """Ruta JSON y regla incumplida, sin el valor (RN-10/RN-14: el cuerpo puede llevar texto clínico)."""
    ruta = "/" + "/".join(map(str, error.absolute_path))
    if error.validator == "required" and isinstance(error.instance, dict):
        faltan = [c for c in error.validator_value if c not in error.instance]
        return f"{ruta}: falta la propiedad obligatoria {', '.join(faltan)}"
    return f"{ruta}: incumple la regla '{error.validator}' del schema"


def verificar_respuesta(metodo: str, ruta: str, status: int, cabeceras: Any, cuerpo: bytes) -> None:
    """Falla si la respuesta no cumple el spec: operación y código declarados, cabeceras y cuerpo.

    El mensaje nombra proveedor, método, plantilla, código y ruta JSON, nunca el valor (US-214).
    """
    spec = _spec_configurado()
    plantilla = resolver_plantilla(spec, ruta)
    verbo = metodo.lower()
    if plantilla is None or verbo not in spec["paths"][plantilla]:
        sin_valores = _ruta_sin_valores(spec, ruta)
        raise AssertionError(
            f"la respuesta no cumple {PROVEEDOR} {metodo.upper()} {sin_valores} {status}: operación no declarada"
        )
    donde = f"{PROVEEDOR} {metodo.upper()} {plantilla} {status}"
    declaradas = spec["paths"][plantilla][verbo]["responses"]
    respuesta = _respuesta_declarada(declaradas, status)
    if respuesta is None:
        raise AssertionError(f"la respuesta no cumple {donde}: código no declarado")
    for nombre in _cabeceras_obligatorias(spec, respuesta):
        if nombre not in cabeceras:
            raise AssertionError(f"la respuesta no cumple {donde}: falta la cabecera {nombre}")
    contenido = _seguir_ref(spec, respuesta).get("content", {}).get("application/json")
    if contenido is None:
        if cuerpo.strip():
            raise AssertionError(f"la respuesta no cumple {donde}: la respuesta no declara cuerpo")
        return
    try:
        cuerpo_json = json.loads(cuerpo)
    except ValueError:
        raise AssertionError(f"la respuesta no cumple {donde}: el cuerpo no es JSON") from None
    errores = _incumplimientos(spec, contenido["schema"], cuerpo_json)
    if errores:
        detalle = "\n".join(f"  {_describir_incumplimiento(e)}" for e in errores)
        raise AssertionError(f"la respuesta no cumple {donde}:\n{detalle}")
