"""Fakes del contexto por chunk de la variante ``llm`` (US-279, L1D-337).

``GeneradorDeContextoFalso`` cumple el contrato del puerto ``GeneradorDeContextoDeChunk`` (LSP): devuelve ``FraseDeContexto``, una
cadena vacía nunca es una frase y NUNCA lanza por un fallo del LLM. ``LlmDeContextoFalso`` es el ``LlmClient`` guionado sobre el
que se prueba la implementación real del generador: devuelve el JSON crudo del guion y registra lo que recibe.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from app.application.corpus_ingestion.ports import (
    MOTIVO_SALIDA_INVALIDA,
    EntradaDelGeneradorDeContexto,
    FraseDeContexto,
)
from app.application.ports import FalloDelLlm

PREFIJO_DE_FRASE_DE_TEST = "Frase de contexto "


def frase_valida(n: int) -> FraseDeContexto:
    return FraseDeContexto(f"{PREFIJO_DE_FRASE_DE_TEST}{n}")


SALIDA_INVALIDA = FraseDeContexto(None, MOTIVO_SALIDA_INVALIDA)


class GeneradorDeContextoFalso:
    """Una respuesta por llamada, en orden: la del ``guion`` o, agotado, una frase numerada por la llamada."""

    def __init__(self, guion: Sequence[FraseDeContexto] = ()) -> None:
        self._guion = list(guion)
        self.llamadas: list[tuple[EntradaDelGeneradorDeContexto, str]] = []

    def generar(self, entrada: EntradaDelGeneradorDeContexto, chunk: str) -> FraseDeContexto:
        self.llamadas.append((entrada, chunk))
        n = len(self.llamadas)
        return self._guion[n - 1] if n <= len(self._guion) else frase_valida(n)


class LlmDeContextoFalso:
    """``LlmClient`` guionado: cada elemento es el texto crudo del modelo o una excepción que se lanza (``FalloDelLlm``)."""

    def __init__(self, guion: Sequence[str | Exception] = ()) -> None:
        self._guion = list(guion)
        self.usuarios: list[str] = []
        self.sistemas: list[str | None] = []
        self.esquemas: list[Mapping[str, Any]] = []

    @property
    def invocaciones(self) -> int:
        return len(self.usuarios)

    async def completar_json(
        self, usuario: str, esquema: Mapping[str, Any], *, sistema: str | None = None
    ) -> str:
        self.usuarios.append(usuario)
        self.sistemas.append(sistema)
        self.esquemas.append(esquema)
        n = len(self.usuarios)
        respuesta = self._guion[n - 1] if n <= len(self._guion) else salida_de(f"Frase {n}")
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta


def salida_de(frase: str) -> str:
    return json.dumps({"contexto": frase}, ensure_ascii=False)


def llm_caido() -> FalloDelLlm:
    return FalloDelLlm("sin respuesta")
