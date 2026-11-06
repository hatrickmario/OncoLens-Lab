"""Generación del seguimiento (US-218): prompt de seguimiento → LLM local → afirmaciones atómicas o marcador.

El LLM aporta el marcador ``outcome`` y, por afirmación, su texto y los alias de chunk que la sustentan, traducidos a
``chunkId`` reales (RN-04); la atribución la compone el código al ensamblar. Una salida que no es JSON o no valida el
esquema interno es ``LlmSalidaInvalidaError`` (`503 LLM_OUTPUT_INVALID`) y nunca se convierte en ``fuera_de_contexto``;
un LLM que no responde es ``LlmLocalNoDisponibleError``. Sin reintento silencioso ni respuesta parcial.
"""

from __future__ import annotations

import copy
import logging
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.application.errores import LlmLocalNoDisponibleError, LlmSalidaInvalidaError
from app.application.generation import fragmentos_dentro_del_presupuesto, tipos_de_error
from app.application.ports import (
    FalloDelLlm,
    LlmClient,
    ResultadoDeRecuperacion,
    SeguimientoGenerado,
)
from app.domain.alias_de_chunks import PATRON_DE_ALIAS, asignar_alias, traducir_citas
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.prompts.seguimiento import MARCADOR_FUERA_DE_CONTEXTO, construir_prompt_de_seguimiento
from app.schemas.generated.models import RagFollowUpRequest

logger = logging.getLogger(__name__)


class _AfirmacionDelSeguimiento(BaseModel):
    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text", min_length=1)
    citas: list[str] = Field(alias="citations")


class SeguimientoCrudo(BaseModel):
    """Esquema interno de la salida del LLM del seguimiento (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    outcome: Literal["respuesta", "fuera_de_contexto"]
    afirmaciones: list[_AfirmacionDelSeguimiento] = Field(alias="claims")


def esquema_de_seguimiento(claims_max: int) -> dict[str, Any]:
    """Esquema entregado al LLM (salida estructurada): hasta ``claims_max`` afirmaciones y alias con el formato de la consulta."""
    esquema = copy.deepcopy(SeguimientoCrudo.model_json_schema())
    esquema["properties"]["claims"]["maxItems"] = claims_max
    afirmacion = esquema["$defs"]["_AfirmacionDelSeguimiento"]
    afirmacion["properties"]["citations"]["items"]["pattern"] = PATRON_DE_ALIAS
    return esquema


class LlmSeguimientoGenerator:
    """Implementa ``SeguimientoGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(
        self,
        cliente: LlmClient,
        *,
        claims_min: int,
        claims_max: int,
        claim_max_words: int,
        max_chars_fragmentos: int = 12000,
    ) -> None:
        self._cliente = cliente
        self._claims_min = claims_min
        self._claims_max = claims_max
        self._claim_max_words = claim_max_words
        self._max_chars_fragmentos = max_chars_fragmentos
        self._esquema = esquema_de_seguimiento(claims_max)

    async def generar(
        self, solicitud: RagFollowUpRequest, recuperacion: ResultadoDeRecuperacion
    ) -> SeguimientoGenerado:
        trace_id = solicitud.traceId.root
        tabla = asignar_alias(
            fragmentos_dentro_del_presupuesto(
                recuperacion.chunks_sobre_umbral, self._max_chars_fragmentos
            )
        )
        prompt = construir_prompt_de_seguimiento(
            solicitud,
            tabla.fragmentos,
            recuperacion.meta.responseLanguage.value,
            claims_min=self._claims_min,
            claims_max=self._claims_max,
            claim_max_words=self._claim_max_words,
        )
        try:
            crudo = await self._cliente.completar_json(
                prompt.usuario, self._esquema, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=seguimiento_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo, trace_id)
        if salida.outcome == MARCADOR_FUERA_DE_CONTEXTO:
            return SeguimientoGenerado(fuera_de_contexto=True)
        afirmaciones = tuple(
            AfirmacionAtomica(
                a.texto.strip(), PapelDeAfirmacion.principal, traducir_citas(tabla, a.citas)
            )
            for a in salida.afirmaciones
        )
        # Solo conteos: nunca un alias, un chunkId ni el texto de una afirmación (RN-14).
        logger.info(
            "event=rag_follow_up_generacion traceId=%s afirmaciones=%d", trace_id, len(afirmaciones)
        )
        return SeguimientoGenerado(fuera_de_contexto=False, afirmaciones=afirmaciones)

    def _parsear(self, crudo: str, trace_id: str) -> SeguimientoCrudo:
        """JSON inválido o fuera de esquema = salida del LLM no validada; solo se registra el tipo de cada error."""
        try:
            return SeguimientoCrudo.model_validate_json(crudo)
        except ValidationError as error:
            logger.warning(
                "event=seguimiento_salida_invalida traceId=%s caracteres=%d errores=%s",
                trace_id,
                len(crudo),
                ",".join(tipos_de_error(error)),
            )
            raise LlmSalidaInvalidaError() from None
