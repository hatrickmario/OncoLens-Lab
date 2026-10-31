"""El envoltorio del generador deja pasar los errores de aplicación con su código propio (US-245, Q1)."""

from __future__ import annotations

import asyncio

import pytest

from app.application.errores import (
    ErrorDeAplicacion,
    LlmLocalNoDisponibleError,
    LlmSalidaInvalidaError,
)
from app.application.generador_fallando_cerrado import GeneradorFallandoCerrado


class _GeneradorQueFalla:
    def __init__(self, error: Exception) -> None:
        self._error = error

    async def generar(self, solicitud, recuperacion):
        raise self._error


def _generar(error: Exception) -> None:
    class _Solicitud:
        class traceId:  # noqa: N801 - imita el atributo del modelo generado
            root = "req_test"

    asyncio.run(GeneradorFallandoCerrado(_GeneradorQueFalla(error)).generar(_Solicitud, None))  # type: ignore[arg-type]


def test_deja_pasar_la_salida_invalida_del_llm_sin_convertirla_en_llm_no_disponible() -> None:
    error = LlmSalidaInvalidaError()

    with pytest.raises(LlmSalidaInvalidaError) as capturado:
        _generar(error)

    assert capturado.value is error


def test_deja_pasar_cualquier_error_de_aplicacion_tal_cual() -> None:
    class _Otro(ErrorDeAplicacion):
        pass

    with pytest.raises(_Otro):
        _generar(_Otro())


def test_convierte_un_error_inesperado_en_llm_local_no_disponible() -> None:
    with pytest.raises(LlmLocalNoDisponibleError):
        _generar(RuntimeError("detalle interno"))
