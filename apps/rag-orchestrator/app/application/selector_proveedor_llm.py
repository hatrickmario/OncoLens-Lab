"""Selector del proveedor del LLM por petición (RN-12): datos reales solo con el LLM local, sin respaldo en la nube."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

from typing import Protocol

from app.application.corpus_metadata.poblacion_puertos import LlmDePoblacion, RespuestaDelLlm
from app.application.ports import LlmClient
from app.domain.reglas_proveedor import ProveedorLlm


class LlmCompleto(LlmClient, LlmDePoblacion, Protocol):
    """Un adapter del LLM con la generación (``LlmClient``) y la tarea corta de población (``LlmDePoblacion``)."""


@dataclass
class ContextoDeProveedor:
    """Clasificación de la petición y proveedor que respondió; lo comparten todos los nodos de una misma petición."""

    clasificacion: str
    nube_usada: bool = False

    @property
    def proveedor_declarado(self) -> ProveedorLlm:
        raise NotImplementedError


@contextmanager
def con_clasificacion(clasificacion: str) -> Iterator[ContextoDeProveedor]:
    raise NotImplementedError
    yield  # pragma: no cover


class SelectorDeProveedorLlm:
    def __init__(self, local: LlmCompleto, nube: LlmCompleto | None, *, nube_habilitada: bool) -> None:
        self._local = local
        self._nube = nube
        self._nube_habilitada = nube_habilitada

    async def completar_json(
        self, usuario: str, esquema: Mapping[str, Any], *, sistema: str | None = None
    ) -> str:
        raise NotImplementedError

    async def completar_json_acotado(
        self,
        usuario: str,
        esquema: Mapping[str, Any],
        *,
        max_tokens: int,
        semilla: int,
        sistema: str | None = None,
    ) -> RespuestaDelLlm:
        raise NotImplementedError

