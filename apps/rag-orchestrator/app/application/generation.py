"""Generación de la rama con evidencia de `/rag/query` (US-225): prompt → LLM local → opciones crudas.

El LLM solo aporta el texto de cada opción y los alias de chunk que cita, traducidos a ``chunkId`` reales (RN-04): todo campo de más (títulos, fuentes,
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
from app.domain.alias_de_chunks import (
    CITA_NO_TRADUCIBLE,
    TablaDeAlias,
    asignar_alias,
    traducir_citas,
)
from app.domain.calidad_de_texto import tiene_artefactos
from app.domain.citations import OpcionGenerada
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import construir_prompt_rag_query
from app.schemas.generated.models import RagQueryInternalRequest

logger = logging.getLogger(__name__)


class _OpcionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    option: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    alias_citados: list[str] = Field(alias="citedFragments")
    details: list[str] = Field(default_factory=list)


class GenerationOutput(BaseModel):
    """Esquema interno de la salida del LLM (no es contrato entre servicios). Sin ``limitations`` `[S1 resp. 11]`."""

    model_config = ConfigDict(extra="ignore")

    options: list[_OpcionCruda]


# Solo en el esquema entregado al runtime (gramática): el parseo no lo valida, un token fuera de patrón es
# ``cita_invalida`` y no un 503 (US-236, design D4).
PATRON_DE_ALIAS = "^C[1-9][0-9]*$"

ESQUEMA_DE_GENERACION: dict[str, Any] = GenerationOutput.model_json_schema()


def esquema_de_generacion(max_parrafos_detalle: int) -> dict[str, Any]:
    """Esquema entregado al LLM (salida estructurada). ``details`` es opcional para el parseo, pero con la gramática
    del runtime un campo no requerido se omite siempre: se exige y se acota al máximo configurado (RN-22). Con 0
    párrafos el campo ni se ofrece."""
    esquema = copy.deepcopy(ESQUEMA_DE_GENERACION)
    opcion = esquema["$defs"]["_OpcionCruda"]
    opcion["properties"]["citedFragments"]["items"]["pattern"] = PATRON_DE_ALIAS
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
        tabla = asignar_alias(
            self._fragmentos_dentro_del_presupuesto(recuperacion.chunks_sobre_umbral)
        )
        prompt = construir_prompt_rag_query(
            solicitud.query,
            resumen_del_contexto_clinico(solicitud.clinicalContext),
            tabla.fragmentos,
            recuperacion.meta.responseLanguage,
            self._max_parrafos_detalle,
        )
        try:
            crudo = await self._cliente.completar_json(prompt, self._esquema)
        except FalloDelLlm:
            logger.warning("event=generacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo, trace_id)
        opciones = tuple(self._opcion_generada(o, tabla) for o in salida.options)
        no_traducibles = sum(c == CITA_NO_TRADUCIBLE for o in opciones for c in o.chunk_ids_citados)
        # Solo conteos: nunca un alias, un chunkId ni texto de un chunk (RN-14, RN-06).
        logger.info(
            "event=rag_query_generacion traceId=%s opcionesGeneradas=%d parrafosDeDetalle=%d "
            "citasTraducidas=%d citasNoTraducibles=%d",
            trace_id,
            len(opciones),
            sum(len(o.details) for o in opciones),
            sum(len(o.chunk_ids_citados) for o in opciones) - no_traducibles,
            no_traducibles,
        )
        return EvidenciaGenerada(
            opciones=opciones,
            limitaciones_propuestas=(),  # el LLM no genera limitaciones en el S1 [S1 resp. 11]
        )

    def _opcion_generada(self, cruda: _OpcionCruda, tabla: TablaDeAlias) -> OpcionGenerada:
        """La opción con sus alias ya traducidos a ``chunkId`` reales: ``validar_citas`` nunca ve un alias (RN-04)."""
        return OpcionGenerada(
            cruda.option,
            cruda.rationale,
            traducir_citas(tabla, cruda.alias_citados),
            self._parrafos_de_detalle(cruda.details),
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
        sin_artefactos = (p for p in limpios if p and not tiene_artefactos(p))
        return tuple(sin_artefactos)[: self._max_parrafos_detalle]

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
