"""``ReescritorDeConsultaLocal``: adapter de ``QueryRewriter`` sobre el LLM local (US-238, RN-12).

Una sola llamada, sin reintento. El prompt es exactamente la pregunta recibida (RN-11). Un LLM caído es ``FalloDelLlm`` (lo
deja pasar el cliente); una salida cortada o que no valida es ``SalidaDeReescrituraInvalida`` sin detalle: ni el prompt ni la
salida del LLM llegan al mensaje (RN-14).
"""

from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict, ValidationError

from app.application.corpus_metadata.poblacion_puertos import FINISH_REASON_CORTADA, LlmDePoblacion
from app.application.ports import SalidaDeReescrituraInvalida
from app.prompts.reescritura_consulta import (
    construir_prompt_de_reescritura,
    esquema_de_reescritura,
)

SEMILLA_DEL_UNICO_INTENTO = 0


class _SalidaDeReescritura(BaseModel):
    model_config = ConfigDict(extra="forbid")
    terminos: list[str]


class ReescritorDeConsultaLocal:
    def __init__(
        self, llm: LlmDePoblacion, *, max_terminos: int, max_tokens_de_salida: int
    ) -> None:
        self._llm = llm
        self._max_terminos = max_terminos
        self._max_tokens_de_salida = max_tokens_de_salida

    async def reformular(self, pregunta: str) -> tuple[str, ...]:
        respuesta = await self._llm.completar_json_acotado(
            construir_prompt_de_reescritura(pregunta, self._max_terminos),
            esquema_de_reescritura(self._max_terminos),
            max_tokens=self._max_tokens_de_salida,
            semilla=SEMILLA_DEL_UNICO_INTENTO,
        )
        if respuesta.finish_reason == FINISH_REASON_CORTADA:
            raise SalidaDeReescrituraInvalida("salida cortada")
        try:
            salida = _SalidaDeReescritura.model_validate(json.loads(respuesta.texto))
        except (ValueError, ValidationError):
            raise SalidaDeReescrituraInvalida("salida inválida") from None
        return tuple(salida.terminos[: self._max_terminos])
