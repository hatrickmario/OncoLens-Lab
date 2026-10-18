"""Sonda del LLM nativo por la API compatible con OpenAI (Ollama, vLLM)."""

import asyncio

import httpx


class OpenAICompatibleLlmHealth:
    """`GET {base_url}/models`: disponible si responde y no es un error 5xx."""

    def __init__(self, base_url: str, timeout_ms: int) -> None:
        self._url = f"{base_url.rstrip('/')}/models"
        self._timeout_s = timeout_ms / 1000

    async def esta_disponible(self) -> bool:
        try:
            # `trust_env=False` (RN-12) y plazo total: la sonda no sale por un proxy del entorno ni se queda colgada.
            async with asyncio.timeout(self._timeout_s):
                async with httpx.AsyncClient(timeout=self._timeout_s, trust_env=False) as cliente:
                    respuesta = await cliente.get(self._url)
        except (httpx.HTTPError, TimeoutError):
            return False
        return respuesta.status_code < 500
