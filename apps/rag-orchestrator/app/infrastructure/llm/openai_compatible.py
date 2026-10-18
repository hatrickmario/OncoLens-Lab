"""Cliente del LLM nativo por la API compatible con OpenAI (Ollama, vLLM): `POST {base_url}/chat/completions`.

Solo habla con ``LLM_BASE_URL`` (RN-12: sin ruta a la nube). Un fallo de conexión, un tiempo agotado, un estado distinto
de 200 o un cuerpo sin contenido es ``FalloDelLlm`` sin detalle: ni el prompt ni la respuesta llegan a un mensaje.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

import httpx

from app.application.ports import FalloDelLlm


class OpenAICompatibleLlmClient:
    """Implementa ``LlmClient``: temperatura 0 y salida restringida por el esquema JSON, sin reintentos."""

    def __init__(self, base_url: str, model: str, timeout_ms: int, max_output_tokens: int) -> None:
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._timeout_s = timeout_ms / 1000
        self._max_output_tokens = max_output_tokens

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        cuerpo = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
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
            # `trust_env=False`: un proxy del entorno no puede sacar el prompt del host local (RN-12). El timeout de
            # httpx es por operación; el plazo total (`asyncio.timeout`) corta a un servidor que gotea bytes.
            async with asyncio.timeout(self._timeout_s):
                async with httpx.AsyncClient(timeout=self._timeout_s, trust_env=False) as cliente:
                    respuesta = await cliente.post(self._url, json=cuerpo)
            respuesta.raise_for_status()
            contenido = respuesta.json()["choices"][0]["message"]["content"]
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
            raise FalloDelLlm("el LLM local no entregó una respuesta utilizable") from None
        if not isinstance(contenido, str):
            raise FalloDelLlm("el LLM local no entregó una respuesta utilizable")
        return contenido
