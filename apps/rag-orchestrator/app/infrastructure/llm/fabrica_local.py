"""Fábrica del generador y del proponente con el LLM local (RN-12); producción y la suite `evaluate` la comparten.

Vive en ``infrastructure`` y no en ``bootstrap``: la suite no puede importar ``app.bootstrap`` (arrastra FastAPI) y su
generador debe ser, por construcción, el de producción (mismo modelo, URL, plazo, tokens, temperatura y presupuesto de
fragmentos). ``envolver_cliente`` deja que quien mide anote cada llamada sin cambiar el adapter."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol, cast, runtime_checkable

from app.application.corpus_metadata.esquema_poblacion import cargar_plantilla
from app.application.corpus_metadata.poblacion_puertos import LlmDePoblacion
from app.application.aplicabilidad_textual import ParametrosDelRespaldo
from app.application.generation import LlmEvidenceGenerator
from app.application.ports import LlmClient
from app.config.settings import Settings
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from app.infrastructure.llm.tarea_de_poblacion import (
    MAX_VALORES_DEL_RESPALDO,
    TareaDePoblacionLocal,
)


@runtime_checkable
class ClienteLlmLocal(LlmClient, LlmDePoblacion, Protocol):
    """El cliente del LLM local completo: la generación (``LlmClient``) y la tarea corta de población (``LlmDePoblacion``)."""


def parametros_del_respaldo(settings: Settings) -> ParametrosDelRespaldo:
    """Plazo, concurrencia y versión del prompt del respaldo de población, de la configuración (RN-22)."""
    raise NotImplementedError("US-244 Gate 2 vuelta 2")


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
    settings: Settings,
    envolver_cliente: EnvolverCliente | None = None,
    llm: LlmDePoblacion | None = None,
) -> TareaDePoblacionLocal:
    """Respaldo de la población en la consulta (US-244): la tarea corta de la ingesta sobre el mismo LLM local (RN-12), con
    el tope de tokens de salida de la extracción y el presupuesto de fragmentos de la generación (RN-22). ``llm`` solo lo
    inyectan los tests: es el borde que se sustituye."""
    return TareaDePoblacionLocal(
        llm or cast(LlmDePoblacion, _cliente_llm_local(settings, envolver_cliente)),
        plantilla=cargar_plantilla(settings.population_prompt_version),
        max_valores=MAX_VALORES_DEL_RESPALDO,
        max_tokens_de_salida=settings.population_extraction_max_output_tokens,
        max_chars_fragmentos=settings.llm_fragments_max_chars,
    )
