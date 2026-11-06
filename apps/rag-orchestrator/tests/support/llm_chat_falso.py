"""``FakeChatLlm``: el LLM local falso del chat, con JSON CRUDO por escenario (`tests/fixtures/llm/chat.json`).

Cumple el contrato del puerto ``LlmClient`` (texto crudo o ``FalloDelLlm``, sin reintento) y cuenta por separado las
llamadas de clasificación y de generación; distingue una de otra por la propiedad ``intent`` del esquema. Registra los
mensajes ``system`` y ``user`` de cada llamada para comprobar la separación instrucciones/datos (US-057).
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "llm"

# ``chat.json`` y un fichero por familia de escenarios (``chat-caso-*.json``, L1D-317): salidas CRUDAS del LLM.
ESCENARIOS: dict[str, Any] = {
    nombre: guion
    for fichero in sorted(_FIXTURES.glob("chat*.json"))
    for nombre, guion in json.loads(fichero.read_text(encoding="utf-8")).items()
}


class FakeChatLlm:
    def __init__(self, escenario: str = "CHAT-OK", error: Exception | None = None) -> None:
        self._guion = ESCENARIOS[escenario]
        self.error = error
        self.usuarios: list[str] = []
        self.sistemas: list[str | None] = []
        self.llamadas_de_clasificacion = 0
        self.llamadas_de_generacion = 0

    @property
    def invocaciones(self) -> int:
        return len(self.usuarios)

    async def completar_json(
        self, usuario: str, esquema: Mapping[str, Any], *, sistema: str | None = None
    ) -> str:
        self.usuarios.append(usuario)
        self.sistemas.append(sistema)
        es_clasificacion = "intent" in esquema.get("properties", {})
        if es_clasificacion:
            self.llamadas_de_clasificacion += 1
        else:
            self.llamadas_de_generacion += 1
        if self.error is not None:
            raise self.error
        return self._guion["ruta" if es_clasificacion else "generacion"]

    def hash_del_ultimo_prompt_de_generacion(self) -> str:
        """SHA-256 de ``sistema`` + ``usuario`` de la última llamada de generación (AC-5: mismo prompt, mismo hash)."""
        return hashlib.sha256(f"{self.sistemas[-1]}\n{self.usuarios[-1]}".encode()).hexdigest()
