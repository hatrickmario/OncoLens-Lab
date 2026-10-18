"""Envoltorio del ``EvidenceGenerator``: todo fallo del generador es el error contractual ``LOCAL_LLM_UNAVAILABLE``."""

from __future__ import annotations

import logging

from app.application.errores import ErrorDeAplicacion, LlmLocalNoDisponibleError
from app.application.ports import EvidenceGenerator, EvidenciaGenerada, ResultadoDeRecuperacion
from app.schemas.generated.models import RagQueryInternalRequest

logger = logging.getLogger(__name__)


class GeneradorFallandoCerrado:
    """Implementa ``EvidenceGenerator`` sobre otro generador (RN-10, RN-12).

    Una excepción inesperada o un valor que no es ``EvidenciaGenerada`` (incluida una salida que el
    generador entregue a medias) se traducen a ``LlmLocalNoDisponibleError`` sin mensaje ni traceback: ``from None``
    evita que el texto de la pregunta o el detalle del modelo lleguen a los logs. Hoy ``generar`` devuelve la
    evidencia completa; cuando L1D-275 la entregue como flujo, el envoltorio deberá consumirlo entero antes de
    devolver nada (nunca tokens sin validar).
    """

    def __init__(self, generador: EvidenceGenerator) -> None:
        self._generador = generador

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        trace_id = solicitud.traceId.root
        try:
            respuesta = await self._generador.generar(solicitud, recuperacion)
        except ErrorDeAplicacion:
            raise
        except Exception as error:  # noqa: BLE001 - todo fallo del generador es "modelo local no disponible"
            raise self._registrar_fallo_del_generador(type(error).__name__, trace_id) from None
        if not isinstance(respuesta, EvidenciaGenerada):
            raise self._registrar_fallo_del_generador("RespuestaInvalida", trace_id)
        return respuesta

    @staticmethod
    def _registrar_fallo_del_generador(motivo: str, trace_id: str) -> LlmLocalNoDisponibleError:
        """Registra solo el motivo (clase del error) y el ``traceId``; nunca el mensaje ni la pregunta."""
        logger.warning("event=generacion_fallo error=%s traceId=%s", motivo, trace_id)
        return LlmLocalNoDisponibleError()
