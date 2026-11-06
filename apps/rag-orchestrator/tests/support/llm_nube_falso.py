"""``LlmNubeFalso``: el adapter de nube falso de RN-12 (US-050); solo existe en ``tests/`` y cuenta cada invocación.

En producción no hay adapter de nube. Cumple el contrato de los puertos ``LlmClient`` y ``LlmDePoblacion`` (texto crudo o
``FalloDelLlm``), igual que el LLM local falso, para que el selector los trate por igual.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from tests.support.llm_falso import FakeLlmClient


class LlmNubeFalso(FakeLlmClient):
    """Responde como ``FakeLlmClient``; ``invocaciones`` cuenta las de ``completar_json`` y las acotadas."""

    def __init__(self, escenario: str = "LLM-OK", error: Exception | None = None) -> None:
        super().__init__(escenario, error)
        self.invocaciones_acotadas = 0

    @property
    def invocaciones(self) -> int:
        return len(self.usuarios) + self.invocaciones_acotadas

    async def completar_json_acotado(
        self,
        usuario: str,
        esquema: Mapping[str, Any],
        *,
        max_tokens: int,
        semilla: int,
        sistema: str | None = None,
    ) -> RespuestaDelLlm:
        self.invocaciones_acotadas += 1
        if self.error is not None:
            raise self.error
        return RespuestaDelLlm('{"values": []}', "stop")
