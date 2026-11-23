"""Juez acotado de la no inferencia de datos críticos faltantes (US-116 AC-1, FR-23, RN-12). Esqueleto del commit rojo."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.application.ports import EtiquetasDeDatosCriticos
from app.evaluation.acuerdo_juez import CompletadorDelJuez


class JuezDeNoInferencia(Protocol):
    veredictos_invalidos: int

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        """``True`` si ``texto`` atribuye un valor al dato crítico ``dato`` (su etiqueta) del paciente."""
        ...


class JuezNoInferenciaLexico:
    """Juez fingido de la CI: sin modelo ni red."""

    veredictos_invalidos = 0

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        raise NotImplementedError("no implementado")


class JuezNoInferenciaConLlm:
    """Juez con un LLM local detrás de ``CompletadorDelJuez``: una sola pregunta acotada por par (texto, dato)."""

    def __init__(self, completador: CompletadorDelJuez) -> None:
        self._completador = completador
        self.veredictos_invalidos = 0

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class MedidorDeNoInferencia:
    """Lo que la suite necesita para medir la no inferencia: el juez y las etiquetas del catálogo de los faltantes."""

    juez: JuezDeNoInferencia
    etiquetas: EtiquetasDeDatosCriticos
