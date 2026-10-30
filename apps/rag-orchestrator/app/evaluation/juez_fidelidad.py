"""Jueces de la fidelidad por afirmación (US-072 AC-3, ADR-41): NLI principal y LLM local secundario.

El juez LLM solo existe si su URL pasó ``exigir_juez_local`` (RN-12): ``crear_juez_llm`` la repite antes de crear el
cliente, de modo que ninguna ruta de código puede enviar un request a un host que no esté en la lista local cerrada.
Los textos de afirmaciones y premisas viven en memoria; los errores nunca los incluyen (RN-14).
"""

from __future__ import annotations

from collections.abc import Sequence
from contextlib import AsyncExitStack
from typing import Protocol

import httpx

from app.application.ports import NliClassifier
from app.domain.nli import ParNli
from app.domain.support import soporta
from app.evaluation.acuerdo_juez import ESQUEMA_DEL_VEREDICTO, juzgar_afirmacion
from app.evaluation.adaptadores_falsos import tokens
from app.evaluation.config_suite import ConfigInvalida, ConfigJuez
from app.evaluation.guardas import exigir_juez_local
from app.evaluation.llamadas import RegistroDeLlamadas

RUTA_DE_COMPLETIONS = "/chat/completions"
MAXIMO_DE_TOKENS_DEL_VEREDICTO = 64
PREFIJO_DE_ID_DE_FRAGMENTO = "F"


class JuezNoDisponible(RuntimeError):
    """El juez no respondió o su respuesta no se pudo interpretar; el mensaje nunca lleva textos."""


class JuezFidelidad(Protocol):
    async def juzgar_soporte(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        """``True`` si la afirmación se desprende de las premisas (los chunks que cita)."""
        ...


class JuezSecundario(JuezFidelidad, Protocol):
    """Juez que no decide solo (ADR-41): además del veredicto cuenta los que no pudo interpretar."""

    veredictos_invalidos: int


class JuezNli:
    """Juez principal: el mismo criterio de soporte de RN-01 (alguna premisa implica la afirmación sobre el umbral)."""

    def __init__(self, clasificador: NliClassifier, umbral: float) -> None:
        self._clasificador = clasificador
        self._umbral = umbral

    async def juzgar_soporte(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        if not premisas:
            return False
        resultados = self._clasificador.clasificar([ParNli(p, afirmacion) for p in premisas])
        return any(soporta(r, self._umbral) for r in resultados)


class JuezLlmLexico:
    """Juez LLM fingido de la CI: soportada si todas sus palabras están en las premisas (sin modelo ni red)."""

    veredictos_invalidos = 0

    async def juzgar_soporte(self, afirmacion: str, premisas: Sequence[str]) -> bool:
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
        registro: RegistroDeLlamadas,
        clase_datos: str,
    ) -> None:
        self._cliente = cliente
        self._modelo = modelo
        self._temperatura = temperatura
        self._semilla = semilla
        self._registro = registro
        self._clase_datos = clase_datos
        self.veredictos_invalidos = 0

    async def juzgar_soporte(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        fragmentos = {
            f"{PREFIJO_DE_ID_DE_FRAGMENTO}{n}": premisa for n, premisa in enumerate(premisas, 1)
        }
        veredicto = await juzgar_afirmacion(afirmacion, fragmentos, self)
        self.veredictos_invalidos += not veredicto.valido
        return veredicto.soportada

    async def completar(self, sistema: str, usuario: str) -> str:
        cuerpo = {
            "model": self._modelo,
            "temperature": self._temperatura,
            "seed": self._semilla,
            "max_tokens": MAXIMO_DE_TOKENS_DEL_VEREDICTO,
            "reasoning_effort": "none",  # como en producción: un modelo que razona agota max_tokens (ADR-39 fase B)
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "veredicto",
                    "schema": ESQUEMA_DEL_VEREDICTO,
                    "strict": True,
                },
            },
            "messages": [
                {"role": "system", "content": sistema},
                {"role": "user", "content": usuario},
            ],
        }
        self._registro.registrar(str(self._cliente.base_url), self._clase_datos, self._modelo)
        try:
            respuesta = await self._cliente.post(RUTA_DE_COMPLETIONS, json=cuerpo)
            respuesta.raise_for_status()
            contenido = respuesta.json()["choices"][0]["message"]["content"]
        except httpx.HTTPError:
            raise JuezNoDisponible("el juez LLM no respondió") from None
        except (KeyError, IndexError, TypeError, ValueError):
            raise JuezNoDisponible("la respuesta del juez LLM no tiene la forma esperada") from None
        return str(contenido)


async def crear_juez_llm(
    config: ConfigJuez | None,
    pila: AsyncExitStack,
    registro: RegistroDeLlamadas,
    clase_datos: str,
) -> JuezSecundario | None:
    """El juez secundario de la configuración, o ``None`` si no hay; el cliente HTTP se cierra con ``pila``."""
    if config is None:
        return None
    if config.proveedor == "fake":
        return JuezLlmLexico()
    if config.base_url is None:
        raise ConfigInvalida("un juez local exige juez.base_url")
    exigir_juez_local(config)  # RN-12: antes de crear el cliente, tampoco con datos sintéticos
    cliente = await pila.enter_async_context(
        httpx.AsyncClient(  # trust_env=False: ningún HTTP(S)_PROXY del proceso desvía el prompt (RN-12)
            base_url=config.base_url, timeout=config.timeout_s, trust_env=False
        )
    )
    return JuezLlmLocal(
        cliente,
        modelo=config.modelo,
        temperatura=config.temperatura,
        semilla=config.semilla,
        registro=registro,
        clase_datos=clase_datos,
    )
