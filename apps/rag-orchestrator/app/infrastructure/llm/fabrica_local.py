"""Fábrica del generador y del proponente con el LLM local (RN-12); producción y la suite `evaluate` la comparten.

Vive en ``infrastructure`` y no en ``bootstrap``: la suite no puede importar ``app.bootstrap`` (arrastra FastAPI) y su
generador debe ser, por construcción, el de producción (mismo modelo, URL, plazo, tokens, temperatura y presupuesto de
fragmentos). ``envolver_cliente`` deja que quien mide anote cada llamada sin cambiar el adapter."""

from __future__ import annotations

from collections.abc import Callable

from app.application.generation import LlmEvidenceGenerator
from app.application.ports import LlmClient
from app.config.settings import Settings
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer

EnvolverCliente = Callable[[LlmClient], LlmClient]


def _cliente_llm_local(settings: Settings, envolver_cliente: EnvolverCliente | None) -> LlmClient:
    cliente = OpenAICompatibleLlmClient(
        settings.llm_base_url,
        settings.llm_model,
        settings.llm_request_timeout_ms,
        settings.llm_max_output_tokens,
        settings.llm_temperature,
    )
    return envolver_cliente(cliente) if envolver_cliente else cliente


def crear_generador_local(
    settings: Settings, envolver_cliente: EnvolverCliente | None = None
) -> LlmEvidenceGenerator:
    """Generación con el LLM nativo local (``LLM_BASE_URL``); sin adapter de nube ni *fallback* (RN-12)."""
    return LlmEvidenceGenerator(
        _cliente_llm_local(settings, envolver_cliente),
        settings.details_max_paragraphs,
        settings.llm_fragments_max_chars,
    )


def crear_proponente_local(
    settings: Settings, envolver_cliente: EnvolverCliente | None = None
) -> LlmApplicabilityTextProposer:
    """Población textual de las fuentes (US-123) con el mismo LLM local y el mismo presupuesto de fragmentos."""
    return LlmApplicabilityTextProposer(
        _cliente_llm_local(settings, envolver_cliente), settings.llm_fragments_max_chars
    )
