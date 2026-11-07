"""Invocación de los puertos bloqueantes de recuperación (Milvus, catálogo, idioma) fallando cerrado.

Los usan ``RAGOrchestratorService`` y las capacidades del chat que leen el corpus (``ConstructorDeCitas``).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import TypeVar

from app.application.errores import RecuperacionNoDisponibleError

logger = logging.getLogger(__name__)

_Resultado = TypeVar("_Resultado")


async def invocar_borde_fallando_cerrado(
    trace_id: str, etapa: str, funcion: Callable[..., _Resultado], *argumentos: object
) -> _Resultado:
    """Ejecuta un puerto bloqueante fuera del bucle; cualquier fallo es `RecuperacionNoDisponibleError` sin detalle.

    Solo se registran la clase del error y el ``traceId``: el mensaje y el traceback pueden traer el host del
    motor o el texto de la pregunta, y ``from None`` evita que lleguen al log de uvicorn.
    """
    try:
        return await asyncio.to_thread(funcion, *argumentos)
    except Exception as error:  # noqa: BLE001 - todo fallo de un borde es "recuperación no disponible"
        logger.warning(
            "event=recuperacion_fallo etapa=%s error=%s traceId=%s",
            etapa,
            type(error).__name__,
            trace_id,
        )
        raise RecuperacionNoDisponibleError(etapa) from None
