"""Constructor de prompts con instrucciones y datos separados (US-057, SEG-13): esqueleto, sin lógica todavía."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Self

ETIQUETAS_RESERVADAS: Final = ("question", "document", "patient_data", "memory")


@dataclass(frozen=True)
class PromptSeparado:
    sistema: str
    usuario: str
    version: str


def escapar_delimitadores(texto: str) -> str:
    raise NotImplementedError


class PromptBuilder:
    def __init__(self, instrucciones: str, version: str) -> None:
        raise NotImplementedError

    def pregunta(self, texto: str) -> Self:
        raise NotImplementedError

    def documento(self, alias: str, texto: str) -> Self:
        raise NotImplementedError

    def datos_del_paciente(self, texto: str) -> Self:
        raise NotImplementedError

    def memoria(self, texto: str) -> Self:
        raise NotImplementedError

    def construir(self) -> PromptSeparado:
        raise NotImplementedError
