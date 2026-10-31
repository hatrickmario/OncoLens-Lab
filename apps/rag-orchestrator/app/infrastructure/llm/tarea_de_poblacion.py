"""``TareaDePoblacionLocal``: adapter de ``PoblacionTask`` sobre el LLM local de la tarea corta (US-244, ADR-47 etapa C).

Es la misma tarea de la ingesta (US-242: plantilla, esquema cerrado y tope de tokens), con UNA fuente y UN criterio por
llamada y sin reintento: en la consulta solo hay un intento. El prompt lleva únicamente los fragmentos de la fuente y la
etiqueta del criterio (RN-11). Un fallo es ``RespaldoFallido`` con la causa y dos medidas; jamás el prompt, la salida del
LLM ni un valor (RN-14). Del LLM solo sobrevive ``(fuente, criterio, valor, chunkId)`` de alcance ``elegibilidad``.
"""

from __future__ import annotations

from app.application.corpus_metadata.esquema import SalidaInvalida
from app.application.corpus_metadata.esquema_poblacion import (
    construir_prompt,
    esquema_de_poblacion,
    parsear_valores,
)
from app.application.corpus_metadata.poblacion_puertos import Fragmento, LlmDePoblacion
from app.application.corpus_metadata.population_fanout import FINISH_REASON_CORTADA
from app.application.ports import FalloDelLlm
from app.domain.applicability_text import (
    CausaDeRespaldo,
    ChunkDeFuente,
    FuenteParaProponer,
    PropuestaDePoblacion,
    RespaldoFallido,
    normalizar_propuesta,
)

SEMILLA_DEL_UNICO_INTENTO = 0


class TareaDePoblacionLocal:
    def __init__(
        self,
        llm: LlmDePoblacion,
        *,
        plantilla: str,
        max_valores: int,
        max_tokens_de_salida: int,
        max_chars_fragmentos: int,
    ) -> None:
        self._llm = llm
        self._plantilla = plantilla
        self._max_valores = max_valores
        self._max_tokens_de_salida = max_tokens_de_salida
        self._max_chars_fragmentos = max_chars_fragmentos

    async def proponer(self, fuente: FuenteParaProponer) -> tuple[PropuestaDePoblacion, ...]:
        if len(fuente.criterios) != 1:
            raise ValueError("el respaldo recibe una fuente y un único criterio por llamada")
        (criterio,) = fuente.criterios
        prompt = construir_prompt(
            self._plantilla,
            criterio,
            self._dentro_del_presupuesto(fuente.chunks),
            self._max_valores,
        )
        try:
            respuesta = await self._llm.completar_json_acotado(
                prompt,
                esquema_de_poblacion(self._max_valores),
                max_tokens=self._max_tokens_de_salida,
                semilla=SEMILLA_DEL_UNICO_INTENTO,
            )
        except FalloDelLlm:
            raise RespaldoFallido(CausaDeRespaldo.caido) from None
        longitud = len(respuesta.texto)
        if respuesta.finish_reason == FINISH_REASON_CORTADA:
            raise RespaldoFallido(CausaDeRespaldo.bucle, respuesta.finish_reason, longitud)
        try:
            valores = parsear_valores(respuesta.texto)
        except SalidaInvalida:
            raise RespaldoFallido(
                CausaDeRespaldo.truncado, respuesta.finish_reason, longitud
            ) from None
        normalizadas = (
            normalizar_propuesta(fuente.external_id, criterio.clave, v.valor, v.chunk_id)
            for v in valores
            if v.alcance == "elegibilidad"
        )
        return tuple(p for p in normalizadas if p is not None)

    def _dentro_del_presupuesto(self, chunks: tuple[ChunkDeFuente, ...]) -> tuple[Fragmento, ...]:
        """Los fragmentos más relevantes que caben en el presupuesto (RN-22); el primero siempre entra."""
        elegidos: list[Fragmento] = []
        usado = 0
        for chunk in chunks:
            if elegidos and usado + len(chunk.texto) > self._max_chars_fragmentos:
                break
            elegidos.append(Fragmento(chunk.chunk_id, chunk.texto))
            usado += len(chunk.texto)
        return tuple(elegidos)
