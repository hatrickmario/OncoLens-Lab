"""Generación de la rama con evidencia de `/rag/query` (US-225): prompt → LLM local → opciones crudas.

El LLM solo aporta el texto de cada opción y los ``chunkId`` que cita (RN-04): todo campo de más (títulos, fuentes,
puntajes) se descarta al parsear. Una salida que no es JSON o no valida contra el esquema interno es
``LlmLocalNoDisponibleError`` (`503`), sin reintento silencioso ni respuesta parcial (`[S1 resp. 12]`).
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.application.errores import LlmLocalNoDisponibleError
from app.application.ports import (
    EvidenciaGenerada,
    FalloDelLlm,
    LlmClient,
    ResultadoDeRecuperacion,
)
from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.domain.citations import OpcionGenerada
from app.prompts.rag_query import construir_prompt_rag_query
from app.schemas.generated.models import RagQueryInternalRequest

logger = logging.getLogger(__name__)


class _OpcionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    option: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    chunk_ids_citados: list[str] = Field(alias="citedChunkIds")


class GenerationOutput(BaseModel):
    """Esquema interno de la salida del LLM (no es contrato entre servicios). Sin ``limitations`` `[S1 resp. 11]`."""

    model_config = ConfigDict(extra="ignore")

    options: list[_OpcionCruda]


ESQUEMA_DE_GENERACION: dict[str, Any] = GenerationOutput.model_json_schema()


class LlmEvidenceGenerator:
    """Implementa ``EvidenceGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(self, cliente: LlmClient) -> None:
        self._cliente = cliente

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        trace_id = solicitud.traceId.root
        prompt = construir_prompt_rag_query(
            solicitud.query,
            resumen_del_contexto_clinico(solicitud.clinicalContext),
            recuperacion.chunks_sobre_umbral,
            recuperacion.meta.responseLanguage,
        )
        try:
            crudo = await self._cliente.completar_json(prompt, ESQUEMA_DE_GENERACION)
        except FalloDelLlm:
            logger.warning("event=generacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo, trace_id)
        logger.info(
            "event=rag_query_generacion traceId=%s opcionesGeneradas=%d",
            trace_id,
            len(salida.options),
        )
        return EvidenciaGenerada(
            opciones=tuple(
                OpcionGenerada(o.option, o.rationale, tuple(o.chunk_ids_citados))
                for o in salida.options
            ),
            limitaciones_propuestas=(),  # el LLM no genera limitaciones en el S1 [S1 resp. 11]
        )

    @staticmethod
    def _parsear(crudo: str, trace_id: str) -> GenerationOutput:
        """JSON inválido o fuera de esquema = modelo local no disponible; solo se registra la clase del error."""
        try:
            return GenerationOutput.model_validate_json(crudo)
        except ValidationError:
            logger.warning("event=generacion_salida_invalida traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
