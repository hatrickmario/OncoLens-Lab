"""Jueces de la fidelidad por afirmación (US-072 AC-3, ADR-41): NLI principal y LLM local secundario.

El juez LLM solo existe si su URL pasó ``exigir_juez_local`` (RN-12): ``crear_juez_llm`` la repite antes de crear el
cliente, de modo que ninguna ruta de código puede enviar un request a un host que no esté en la lista local cerrada.
Los textos de afirmaciones y premisas viven en memoria; los errores nunca los incluyen (RN-14).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from contextlib import AsyncExitStack
from typing import Protocol

import httpx

from app.application.ports import NliClassifier
from app.domain.nli import ParNli
from app.domain.support import soporta
from app.evaluation.adaptadores_falsos import tokens
from app.evaluation.config_suite import ConfigJuez
from app.evaluation.guardas import exigir_juez_local
from app.evaluation.llamadas import RegistroDeLlamadas

RUTA_DE_COMPLETIONS = "/chat/completions"
SISTEMA = (
    "Eres un verificador de afirmaciones. Decide si la afirmación se desprende de los fragmentos dados. "
    "Responde exactamente SOPORTADA o NO_SOPORTADA, sin explicación."
)
MAXIMO_DE_TOKENS_DEL_VEREDICTO = 16
_VEREDICTO = re.compile(r"\W*(NO_SOPORTADA|SOPORTADA)\W*", re.IGNORECASE)


class JuezNoDisponible(RuntimeError):
    """El juez no respondió o su respuesta no se pudo interpretar; el mensaje nunca lleva textos."""


class JuezFidelidad(Protocol):
    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        """``True`` si la afirmación se desprende de las premisas (los chunks que cita)."""
        ...


class JuezNli:
    """Juez principal: el mismo criterio de soporte de RN-01 (alguna premisa implica la afirmación sobre el umbral)."""

    def __init__(self, clasificador: NliClassifier, umbral: float) -> None:
        self._clasificador = clasificador
        self._umbral = umbral

    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        if not premisas:
            return False
        resultados = self._clasificador.clasificar([ParNli(p, afirmacion) for p in premisas])
        return any(soporta(r, self._umbral) for r in resultados)


class JuezLlmLexico:
    """Juez LLM fingido de la CI: soportada si todas sus palabras están en las premisas (sin modelo ni red)."""

    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        disponibles = frozenset().union(*(tokens(p) for p in premisas)) if premisas else frozenset()
        return bool(premisas) and tokens(afirmacion) <= disponibles


class JuezLlmLocal:
    """Juez LLM secundario por una API compatible con OpenAI (Ollama ``/v1``), con ``temperature`` y ``seed`` fijos."""

    def __init__(
        self,
        cliente: httpx.AsyncClient,
        *,
        modelo: str,
        temperatura: float,
        semilla: int,
        registro: RegistroDeLlamadas | None = None,
        clase_datos: str = "sintetico",
    ) -> None:
        self._cliente = cliente
        self._modelo = modelo
        self._temperatura = temperatura
        self._semilla = semilla
        self._registro = registro
        self._clase_datos = clase_datos

    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        fragmentos = "\n".join(f"- {p}" for p in premisas)
        cuerpo = {
            "model": self._modelo,
            "temperature": self._temperatura,
            "seed": self._semilla,
            "max_tokens": MAXIMO_DE_TOKENS_DEL_VEREDICTO,
            "messages": [
                {"role": "system", "content": SISTEMA},
                {
                    "role": "user",
                    "content": f"Fragmentos:\n{fragmentos}\n\nAfirmación: {afirmacion}",
                },
            ],
        }
        if self._registro is not None:
            self._registro.registrar(str(self._cliente.base_url), self._clase_datos)
        try:
            respuesta = await self._cliente.post(RUTA_DE_COMPLETIONS, json=cuerpo)
            respuesta.raise_for_status()
            contenido = respuesta.json()["choices"][0]["message"]["content"]
        except httpx.HTTPError:
            raise JuezNoDisponible("el juez LLM no respondió") from None
        except (KeyError, IndexError, TypeError, ValueError):
            raise JuezNoDisponible("la respuesta del juez LLM no tiene la forma esperada") from None
        return _interpretar(str(contenido))


def _interpretar(contenido: str) -> bool:
    veredicto = _VEREDICTO.fullmatch(contenido)
    if veredicto is None:
        raise JuezNoDisponible("el veredicto del juez LLM no se pudo interpretar")
    return veredicto.group(1).upper() == "SOPORTADA"


async def crear_juez_llm(
    config: ConfigJuez | None,
    pila: AsyncExitStack,
    registro: RegistroDeLlamadas | None = None,
    clase_datos: str = "sintetico",
) -> JuezFidelidad | None:
    """El juez secundario de la configuración, o ``None`` si no hay; el cliente HTTP se cierra con ``pila``."""
    if config is None:
        return None
    if config.proveedor == "fake" or config.base_url is None:
        return JuezLlmLexico()
    exigir_juez_local(config)  # RN-12: antes de crear el cliente, tampoco con datos sintéticos
    cliente = await pila.enter_async_context(
        httpx.AsyncClient(base_url=config.base_url, timeout=config.timeout_s)
    )
    return JuezLlmLocal(
        cliente,
        modelo=config.modelo,
        temperatura=config.temperatura,
        semilla=config.semilla,
        registro=registro,
        clase_datos=clase_datos,
    )
