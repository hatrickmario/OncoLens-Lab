"""Verificación automática del proveedor en Pytest (US-214): cada respuesta de la app se valida contra el spec.

El fixture de sesión `verificacion_del_proveedor` parchea `TestClient.__init__` (su base es `httpx2.Client`, no
`httpx.Client`, así que parchear este último no lo alcanza) y `httpx.AsyncClient.__init__` (solo con `ASGITransport`) para añadir un hook de respuesta que llama a
`contract.verificar_respuesta`. Los clientes httpx salientes de la app (LLM, health) no se tocan: sus
respuestas no son del proveedor.

Limitaciones: (1) solo se verifica lo que pasa por un `TestClient` o un `AsyncClient` con `ASGITransport`
creados durante la sesión; una llamada directa a la app ASGI o a un servicio no se ve. (2) El hook corre
al recibir la respuesta, no al construirla: un fallo del hook se propaga desde la llamada del cliente.

Salida explícita: `@pytest.mark.sin_verificacion_de_proveedor` desactiva el hook en ese test (por ejemplo, el que
fabrica a propósito una respuesta fuera de contrato para probar otra cosa). Se usa con motivo en el test.
"""

from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.support import contract

MARCADOR_SALIDA = "sin_verificacion_de_proveedor"

_respuestas_verificadas = 0
_activa = True


def respuestas_verificadas() -> int:
    return _respuestas_verificadas


def _registrar_verificacion() -> None:
    global _respuestas_verificadas
    _respuestas_verificadas += 1


def _verificar(respuesta: httpx.Response) -> None:
    peticion = respuesta.request
    contract.verificar_respuesta(
        peticion.method,
        peticion.url.path,
        respuesta.status_code,
        respuesta.headers,
        respuesta.content,
    )
    _registrar_verificacion()


def verificar_respuesta_sincrona(respuesta: httpx.Response) -> None:
    if not _activa:
        return
    respuesta.read()
    _verificar(respuesta)


async def verificar_respuesta_asincrona(respuesta: httpx.Response) -> None:
    if not _activa:
        return
    await respuesta.aread()
    _verificar(respuesta)


@pytest.fixture(scope="session", autouse=True)
def verificacion_del_proveedor(spec_empaquetado: dict) -> Iterator[None]:
    """Instala el hook en cada cliente de la app creado durante la sesión, sin que el test lo pida."""
    cliente_original = TestClient.__init__
    asincrono_original = httpx.AsyncClient.__init__

    def cliente(self: TestClient, *args: Any, **kwargs: Any) -> None:
        cliente_original(self, *args, **kwargs)
        self.event_hooks["response"].append(verificar_respuesta_sincrona)

    def asincrono(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        asincrono_original(self, *args, **kwargs)
        if isinstance(kwargs.get("transport"), httpx.ASGITransport):
            self.event_hooks["response"].append(verificar_respuesta_asincrona)

    TestClient.__init__ = cliente  # type: ignore[method-assign]
    httpx.AsyncClient.__init__ = asincrono  # type: ignore[method-assign]
    yield
    TestClient.__init__ = cliente_original  # type: ignore[method-assign]
    httpx.AsyncClient.__init__ = asincrono_original  # type: ignore[method-assign]


@pytest.fixture(autouse=True)
def salida_explicita_de_la_verificacion(request: pytest.FixtureRequest) -> Iterator[None]:
    """El marcador `sin_verificacion_de_proveedor` apaga el hook durante ese test."""
    global _activa
    _activa = request.node.get_closest_marker(MARCADOR_SALIDA) is None
    yield
    _activa = True
