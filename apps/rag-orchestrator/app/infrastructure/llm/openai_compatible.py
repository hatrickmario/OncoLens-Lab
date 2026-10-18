"""Cliente del LLM nativo por la API compatible con OpenAI (Ollama, vLLM): `POST {base_url}/chat/completions`.

Solo habla con ``LLM_BASE_URL`` (RN-12: sin ruta a la nube). Un fallo de conexión, un tiempo agotado, un estado distinto
de 200 o un cuerpo sin contenido es ``FalloDelLlm`` sin detalle: ni el prompt ni la respuesta llegan a un mensaje.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import httpx

from app.application.ports import FalloDelLlm


class OpenAICompatibleLlmClient:
    """Implementa ``LlmClient``: temperatura de la configuración (0 por defecto), salida restringida por el esquema."""

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_ms: int,
        max_output_tokens: int,
        temperature: float = 0.0,
    ) -> None:
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._timeout_s = timeout_ms / 1000
        self._max_output_tokens = max_output_tokens
        self._temperature = temperature

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        cuerpo = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self._temperature,
            "max_tokens": self._max_output_tokens,
            "stream": False,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "generation_output",
                    "schema": dict(esquema),
                    "strict": True,
                },
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as cliente:
                respuesta = await cliente.post(self._url, json=cuerpo)
            respuesta.raise_for_status()
            contenido = respuesta.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            raise FalloDelLlm("el LLM local no entregó una respuesta utilizable") from None
        if not isinstance(contenido, str):
            raise FalloDelLlm("el LLM local no entregó una respuesta utilizable")
        return contenido
