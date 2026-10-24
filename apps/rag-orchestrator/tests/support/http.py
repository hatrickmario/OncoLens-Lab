"""Handlers de `respx` construidos desde `contracts/examples/` (L1D-285, US-213 AC-10, ADR-26, design D5).

Equivalente Python de `packages/test-support/msw/handlerDesdeEjemplo.ts`: un mock del HTTP saliente no puede divergir del
contrato. `sobrescribir` ajusta valores del ejemplo (un estado, un puntaje) pero NO puede inventar campos: una clave ausente
en el ejemplo es un campo que el contrato no describe y hace fallar el test que lo usa, nombrando el campo y el ejemplo.
"""

import copy
import json
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import httpx
import respx

CARPETA_DE_EJEMPLOS = Path(__file__).resolve().parents[4] / "contracts" / "examples"


def cargar_ejemplo(archivo_de_ejemplo: str) -> Any:
    """Carga el ejemplo por su nombre de archivo; un nombre inexistente falla nombrándolo."""
    try:
        return json.loads((CARPETA_DE_EJEMPLOS / archivo_de_ejemplo).read_text(encoding="utf-8"))
    except (OSError, ValueError) as causa:
        raise AssertionError(
            f"handler_desde_ejemplo: no se pudo leer el ejemplo {archivo_de_ejemplo} "
            f"de contracts/examples/ ({causa})"
        ) from causa


def aplicar_sobrescritura(
    base: Any, sobrescribir: Mapping[str, Any], archivo_de_ejemplo: str, ruta: str = ""
) -> Any:
    """Copia de `base` con `sobrescribir` aplicado; falla nombrando el campo y el ejemplo si la clave no existe."""
    if not isinstance(base, dict):
        raise AssertionError(
            f'handler_desde_ejemplo: el campo "{ruta}" no es un objeto en el ejemplo {archivo_de_ejemplo}'
        )
    resultado = copy.deepcopy(base)
    for clave, valor in sobrescribir.items():
        campo = clave if not ruta else f"{ruta}.{clave}"
        if clave not in base:
            raise AssertionError(
                f'handler_desde_ejemplo: el campo "{campo}" no existe en el ejemplo {archivo_de_ejemplo}'
            )
        if isinstance(valor, Mapping) and isinstance(base[clave], dict):
            resultado[clave] = aplicar_sobrescritura(base[clave], valor, archivo_de_ejemplo, campo)
        else:
            resultado[clave] = valor
    return resultado


def handler_desde_ejemplo(
    router: respx.MockRouter,
    metodo: str,
    url: str,
    archivo_de_ejemplo: str,
    *,
    sobrescribir: Mapping[str, Any] | None = None,
    status: int = 200,
    al_recibir: Callable[[httpx.Request], None] | None = None,
) -> respx.Route:
    """Ruta de `router` que responde el ejemplo (con `sobrescribir`); `al_recibir` observa cada petición.

    Se valida al construir la ruta, no al atender: el test falla en su arranque y no depende de que la petición ocurra.
    """
    ejemplo = cargar_ejemplo(archivo_de_ejemplo)
    cuerpo = (
        aplicar_sobrescritura(ejemplo, sobrescribir, archivo_de_ejemplo)
        if sobrescribir
        else ejemplo
    )

    def responder(peticion: httpx.Request) -> httpx.Response:
        if al_recibir:
            al_recibir(peticion)
        return httpx.Response(status, json=cuerpo)

    return router.route(method=metodo.upper(), url=url).mock(side_effect=responder)
