"""La telemetría de LangChain/LangSmith debe estar apagada (L1D-316; RN-10, RN-12)."""

from __future__ import annotations

from collections.abc import Mapping

VARIABLES_DE_TELEMETRIA = ("LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING")


class TelemetriaDeLangChainActiva(RuntimeError):
    """Alguna variable de trazado vale verdadero: se niega el arranque. Nombra la variable, nunca su valor."""


def exigir_telemetria_de_langchain_apagada(entorno: Mapping[str, str]) -> None:
    raise NotImplementedError("no implementado")
