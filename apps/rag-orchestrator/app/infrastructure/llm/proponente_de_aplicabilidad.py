"""``LlmApplicabilityTextProposer``: adapter del LLM local para la población textual de una fuente (US-123, design D6).

Implementa ``ApplicabilityTextProposer`` sobre el puerto ``LlmClient``. Del LLM solo sobrevive ``(fuente, criterio, valor,
chunkId)``: todo campo de más (``patientValue``, ``status``, puntajes) se descarta al parsear (ADR-34). Una salida que no
es JSON o no valida contra el esquema, y un fallo del cliente, son ``LlmLocalNoDisponibleError`` (`503`), sin reintento
silencioso. Logs: solo la clase del error y conteos; nunca el prompt, un valor ni texto de un chunk (RN-10).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.application.errores import LlmLocalNoDisponibleError
from app.application.ports import FalloDelLlm, LlmClient
from app.domain.applicability_text import ChunkDeFuente, FuenteParaProponer, PropuestaDePoblacion
from app.prompts.aplicabilidad_texto import construir_prompt_aplicabilidad_texto, rotulo_de_fuente

logger = logging.getLogger(__name__)

LONGITUD_MAXIMA_DEL_VALOR = 200
"""Un valor de población es una frase corta; una más larga no cabe como hipótesis del NLI ni como celda de la tabla."""


class _PropuestaCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fuente: str = Field(alias="source")
    criterio: str = Field(alias="criterion")
    valor: str = Field(alias="value", min_length=1, max_length=LONGITUD_MAXIMA_DEL_VALOR)
    chunk_id: str = Field(alias="chunkId", min_length=1)


class SalidaDeAplicabilidad(BaseModel):
    """Esquema interno de la salida del LLM (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    proposals: list[_PropuestaCruda]


ESQUEMA_DE_APLICABILIDAD: dict[str, Any] = SalidaDeAplicabilidad.model_json_schema()


class LlmApplicabilityTextProposer:
    def __init__(self, cliente: LlmClient, max_chars_fragmentos: int = 12000) -> None:
        self._cliente = cliente
        self._max_chars_fragmentos = max_chars_fragmentos

    async def proponer(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[PropuestaDePoblacion, ...]:
        if not fuentes:
            return ()
        prompt = construir_prompt_aplicabilidad_texto(self._dentro_del_presupuesto(fuentes))
        try:
            crudo = await self._cliente.completar_json(prompt, ESQUEMA_DE_APLICABILIDAD)
        except FalloDelLlm:
            logger.warning("event=aplicabilidad_llm_fallo")
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo)
        por_rotulo = {rotulo_de_fuente(i): f.external_id for i, f in enumerate(fuentes, start=1)}
        return tuple(
            PropuestaDePoblacion(por_rotulo[p.fuente], p.criterio, p.valor.strip(), p.chunk_id)
            for p in salida.proposals
            if p.fuente in por_rotulo and p.valor.strip()
        )

    def _dentro_del_presupuesto(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[FuenteParaProponer, ...]:
        """Los fragmentos más relevantes de cada fuente que caben en el presupuesto (RN-22); uno por fuente siempre entra.

        La ventana del runtime se reparte entre el prompt y la salida: con demasiado texto la salida se trunca (503)."""
        usado = 0
        recortadas: list[FuenteParaProponer] = []
        for fuente in fuentes:
            elegidos: list[ChunkDeFuente] = []
            for chunk in fuente.chunks:
                if elegidos and usado + len(chunk.texto) > self._max_chars_fragmentos:
                    break
                elegidos.append(chunk)
                usado += len(chunk.texto)
            recortadas.append(
                FuenteParaProponer(fuente.external_id, fuente.criterios, tuple(elegidos))
            )
        return tuple(recortadas)

    @staticmethod
    def _parsear(crudo: str) -> SalidaDeAplicabilidad:
        """JSON inválido o fuera de esquema = modelo local no disponible; solo se registra la clase de cada error."""
        try:
            return SalidaDeAplicabilidad.model_validate_json(crudo)
        except ValidationError as error:
            logger.warning(
                "event=aplicabilidad_salida_invalida caracteres=%d errores=%s",
                len(crudo),
                ",".join(sorted({e["type"] for e in error.errors()})),
            )
            raise LlmLocalNoDisponibleError() from None
