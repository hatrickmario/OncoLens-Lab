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


def cuerpo_de_peticion(
    modelo: str,
    prompt: str,
    esquema: Mapping[str, Any] | None,
    temperatura: float,
    max_tokens: int,
    razonar: bool = False,
    *,
    sistema: str | None = None,
    semilla: int | None = None,
    nombre_del_esquema: str = "generation_output",
) -> dict[str, Any]:
    """Cuerpo de ``POST /chat/completions`` de producción; el script de ADR-39 y el juez de la suite lo reutilizan.

    ``sistema`` antepone un mensaje de sistema; ``semilla`` fija ``seed`` (el juez la necesita para ser reproducible)."""
    mensajes = [{"role": "user", "content": prompt}]
    if sistema is not None:
        mensajes.insert(0, {"role": "system", "content": sistema})
    cuerpo: dict[str, Any] = {
        "model": modelo,
        "messages": mensajes,
        "temperature": temperatura,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if semilla is not None:
        cuerpo["seed"] = semilla
    if not razonar:
        # Los modelos que razonan por defecto agotan max_tokens y dejan el contenido vacío (ADR-39 fase B, hallazgo).
        cuerpo["reasoning_effort"] = "none"
    if esquema is not None:
        cuerpo["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": nombre_del_esquema, "schema": dict(esquema), "strict": True},
        }
    return cuerpo


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
        cuerpo = cuerpo_de_peticion(
            self._model, prompt, esquema, self._temperature, self._max_output_tokens
        )
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
