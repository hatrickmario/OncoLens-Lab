"""FX-08b-c: adapters falsos del respaldo de la población en la consulta (US-244). Solo texto sintético.

Los fakes están en el borde del LLM (``LlmDePoblacion``, el mismo puerto de la ingesta) para que el adapter real
``TareaDePoblacionLocal`` construya el prompt y traduzca los fallos: lo que el fake registra es lo que recibiría el LLM.
Cumplen el contrato del puerto (LSP): un LLM caído es ``FalloDelLlm`` y una salida cortada lleva ``finish_reason = length``.

* ``RESP-OK``: para ``doc-b9``, ``estado_menopausico`` = [``postmenopausal women`` · elegibilidad] citando ``ch-b9-1``.
* ``RESP-SILENCIO``: ``{"values": []}`` (el LLM no encuentra nada): la referencia «sin respaldo» de AC-2.
* ``RESP-BUCLE``: repite esa propuesta hasta agotar ``max_tokens``; ``finish_reason = length``.
* ``RESP-TRUNCADO``: JSON cortado a mitad, con ``finish_reason = stop``.
* ``RESP-LENTO``: no responde dentro del plazo (se cancela al vencer ``POPULATION_FALLBACK_DEADLINE_MS``).
* ``RESP-CAIDO``: error de conexión.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from app.application.corpus_metadata.esquema_poblacion import cargar_plantilla
from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from app.application.ports import FalloDelLlm
from app.infrastructure.llm.tarea_de_poblacion import TareaDePoblacionLocal

VALOR_DE_RESP_OK = "postmenopausal women"
PROPUESTA_DE_RESP_OK = {"value": VALOR_DE_RESP_OK, "chunkId": "ch-b9-1", "scope": "elegibilidad"}
ESCENARIOS_DE_RESPALDO = (
    "RESP-OK",
    "RESP-SILENCIO",
    "RESP-BUCLE",
    "RESP-TRUNCADO",
    "RESP-LENTO",
    "RESP-CAIDO",
)
_CRITERIO_EN_PROMPT = re.compile(r"^Criterio: (\S+)$", re.MULTILINE)
_FRAGMENTO_EN_PROMPT = re.compile(r"^\[(ch-[a-z0-9-]+)\]$", re.MULTILINE)
CARACTERES_POR_TOKEN = 4


@dataclass(frozen=True)
class LlamadaDeRespaldo:
    """Una llamada al LLM del respaldo: el prompt tal como lo construyó el adapter real y lo que se puede inferir de él."""

    prompt: str
    criterio: str
    chunk_ids: tuple[str, ...]
    max_tokens: int
    semilla: int


@dataclass
class RespaldoLlmFalso:
    escenario: str = "RESP-OK"
    llamadas: list[LlamadaDeRespaldo] = field(default_factory=list)

    @property
    def invocaciones(self) -> int:
        return len(self.llamadas)

    async def completar_json_acotado(
        self, prompt: str, esquema: Mapping[str, Any], *, max_tokens: int, semilla: int
    ) -> RespuestaDelLlm:
        criterio = _CRITERIO_EN_PROMPT.search(prompt)
        assert criterio is not None, "el prompt debe declarar 'Criterio: <clave>'"
        self.llamadas.append(
            LlamadaDeRespaldo(
                prompt,
                criterio.group(1),
                tuple(_FRAGMENTO_EN_PROMPT.findall(prompt)),
                max_tokens,
                semilla,
            )
        )
        return await self._responder(max_tokens)

    async def _responder(self, max_tokens: int) -> RespuestaDelLlm:
        if self.escenario == "RESP-CAIDO":
            raise FalloDelLlm("llm falso: sin respuesta")
        if self.escenario == "RESP-LENTO":
            await asyncio.sleep(3600)  # la cancela el plazo del respaldo; nunca llega a devolver
        if self.escenario == "RESP-SILENCIO":
            return RespuestaDelLlm('{"values": []}', "stop")
        if self.escenario == "RESP-BUCLE":
            return RespuestaDelLlm(_salida_en_bucle(max_tokens), "length")
        if self.escenario == "RESP-TRUNCADO":
            return RespuestaDelLlm('{"values": [{"value": "postmeno', "stop")
        return RespuestaDelLlm(json.dumps({"values": [PROPUESTA_DE_RESP_OK]}), "stop")


def _salida_en_bucle(max_tokens: int) -> str:
    """La propuesta repetida hasta agotar el presupuesto de tokens: un JSON que se corta sin cerrar."""
    una = json.dumps(PROPUESTA_DE_RESP_OK)
    repeticiones = max_tokens * CARACTERES_POR_TOKEN // len(una) + 1
    return ('{"values": [' + ", ".join([una] * repeticiones))[: max_tokens * CARACTERES_POR_TOKEN]


def tarea_de_respaldo(
    llm: RespaldoLlmFalso, *, max_tokens: int = 512, max_chars_fragmentos: int = 12000
) -> TareaDePoblacionLocal:
    """El adapter real sobre el LLM falso: la plantilla versionada de la ingesta, con el tope de la configuración."""
    return TareaDePoblacionLocal(
        llm,
        plantilla=cargar_plantilla("poblacion_v1"),
        max_valores=3,
        max_tokens_de_salida=max_tokens,
        max_chars_fragmentos=max_chars_fragmentos,
    )
