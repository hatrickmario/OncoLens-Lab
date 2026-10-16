"""Sonda del LLM nativo por la API compatible con OpenAI (Ollama, vLLM)."""


class OpenAICompatibleLlmHealth:
    def __init__(self, base_url: str, timeout_ms: int) -> None:
        self._base_url = base_url
        self._timeout_ms = timeout_ms

    async def esta_disponible(self) -> bool:
        raise NotImplementedError("no implementado")
