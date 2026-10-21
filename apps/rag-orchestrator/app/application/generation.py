"""Generación de la rama con evidencia de `/rag/query` (US-225): prompt → LLM local → opciones crudas.

El LLM solo aporta el texto de cada opción y los ``chunkId`` que cita (RN-04): todo campo de más (títulos, fuentes,
puntajes) se descarta al parsear. Una salida que no es JSON o no valida contra el esquema interno es
``LlmLocalNoDisponibleError`` (`503`), sin reintento silencioso ni respuesta parcial (`[S1 resp. 12]`).
"""

from __future__ import annotations

import copy
import logging
from collections.abc import Sequence
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
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import construir_prompt_rag_query
from app.schemas.generated.models import RagQueryInternalRequest

logger = logging.getLogger(__name__)


class _OpcionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    option: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    chunk_ids_citados: list[str] = Field(alias="citedChunkIds")
    details: list[str] = Field(default_factory=list)


class GenerationOutput(BaseModel):
    """Esquema interno de la salida del LLM (no es contrato entre servicios). Sin ``limitations`` `[S1 resp. 11]`."""

    model_config = ConfigDict(extra="ignore")

    options: list[_OpcionCruda]


ESQUEMA_DE_GENERACION: dict[str, Any] = GenerationOutput.model_json_schema()


def esquema_de_generacion(max_parrafos_detalle: int) -> dict[str, Any]:
    """Esquema entregado al LLM (salida estructurada). ``details`` es opcional para el parseo, pero con la gramática
    del runtime un campo no requerido se omite siempre: se exige y se acota al máximo configurado (RN-22). Con 0
    párrafos el campo ni se ofrece."""
    esquema = copy.deepcopy(ESQUEMA_DE_GENERACION)
    opcion = esquema["$defs"]["_OpcionCruda"]
    if max_parrafos_detalle > 0:
        opcion["required"] = [*opcion["required"], "details"]
        opcion["properties"]["details"]["maxItems"] = max_parrafos_detalle
    else:
        del opcion["properties"]["details"]
    return esquema


class LlmEvidenceGenerator:
    """Implementa ``EvidenceGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(
        self,
        cliente: LlmClient,
        max_parrafos_detalle: int = 2,
        max_chars_fragmentos: int = 12000,
    ) -> None:
        self._cliente = cliente
        self._max_parrafos_detalle = max_parrafos_detalle
        self._max_chars_fragmentos = max_chars_fragmentos
        self._esquema = esquema_de_generacion(max_parrafos_detalle)

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        trace_id = solicitud.traceId.root
        prompt = construir_prompt_rag_query(
            solicitud.query,
            resumen_del_contexto_clinico(solicitud.clinicalContext),
            self._fragmentos_dentro_del_presupuesto(recuperacion.chunks_sobre_umbral),
            recuperacion.meta.responseLanguage,
            self._max_parrafos_detalle,
        )
        try:
            crudo = await self._cliente.completar_json(prompt, self._esquema)
        except FalloDelLlm:
            logger.warning("event=generacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo, trace_id)
        logger.info(
            "event=rag_query_generacion traceId=%s opcionesGeneradas=%d parrafosDeDetalle=%d",
            trace_id,
            len(salida.options),
            sum(len(self._parrafos_de_detalle(o.details)) for o in salida.options),
        )
        return EvidenciaGenerada(
            opciones=tuple(
                OpcionGenerada(
                    o.option,
                    o.rationale,
                    tuple(o.chunk_ids_citados),
                    self._parrafos_de_detalle(o.details),
                )
                for o in salida.options
            ),
            limitaciones_propuestas=(),  # el LLM no genera limitaciones en el S1 [S1 resp. 11]
        )

    def _fragmentos_dentro_del_presupuesto(
        self, chunks: Sequence[ChunkPuntuado]
    ) -> list[ChunkPuntuado]:
        """Los más relevantes que caben en ``max_chars_fragmentos`` (el primero siempre entra).

        La ventana de contexto del runtime se reparte entre el prompt y la salida: con demasiados fragmentos la salida se
        trunca y el JSON queda inválido (503). Los chunks llegan ordenados por relevancia (RN-22).
        """
        elegidos: list[ChunkPuntuado] = []
        total = 0
        for chunk in chunks:
            if elegidos and total + len(chunk.chunk_text) > self._max_chars_fragmentos:
                break
            elegidos.append(chunk)
            total += len(chunk.chunk_text)
        return elegidos

    def _parrafos_de_detalle(self, crudos: list[str]) -> tuple[str, ...]:
        """Sin párrafos vacíos y hasta el máximo configurado (RN-22): lo que sobra se descarta sin validarlo."""
        limpios = (p.strip() for p in crudos)
        return tuple(p for p in limpios if p)[: self._max_parrafos_detalle]

    @staticmethod
    def _parsear(crudo: str, trace_id: str) -> GenerationOutput:
        """JSON inválido o fuera de esquema = modelo local no disponible; solo se registra la clase del error."""
        try:
            return GenerationOutput.model_validate_json(crudo)
        except ValidationError as error:
            # Solo la clase de cada error y la longitud: nunca el contenido generado a partir del corpus (RN-14).
            logger.warning(
                "event=generacion_salida_invalida traceId=%s caracteres=%d errores=%s",
                trace_id,
                len(crudo),
                ",".join(sorted({e["type"] for e in error.errors()})),
            )
            raise LlmLocalNoDisponibleError() from None
