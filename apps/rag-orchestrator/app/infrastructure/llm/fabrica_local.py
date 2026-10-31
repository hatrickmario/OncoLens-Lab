"""Fábrica del generador y del proponente con el LLM local (RN-12); producción y la suite `evaluate` la comparten."""

from __future__ import annotations

from collections.abc import Callable

from app.application.generation import LlmEvidenceGenerator
from app.application.ports import LlmClient
from app.config.settings import Settings
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer

EnvolverCliente = Callable[[LlmClient], LlmClient]


def crear_generador_local(
    settings: Settings, envolver_cliente: EnvolverCliente | None = None
) -> LlmEvidenceGenerator:
    raise NotImplementedError("no implementado")


def crear_proponente_local(
    settings: Settings, envolver_cliente: EnvolverCliente | None = None
) -> LlmApplicabilityTextProposer:
    raise NotImplementedError("no implementado")
