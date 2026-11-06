"""Selector del proveedor del LLM por petición (RN-12): datos reales solo con el LLM local, sin respaldo en la nube.

``SelectorDeProveedorLlm`` implementa los mismos puertos que el adapter local (``LlmClient`` y ``LlmDePoblacion``) y se
interpone entre la fábrica y los consumidores de ``/rag/query``, ``/rag/follow-up`` y ``/chat/turn``. La clasificación de la
petición entra por ``con_clasificacion()``, que fija un ``ContextoDeProveedor`` propio de la petición (un ``ContextVar``, no
estado global: cada petición ve el suyo). Sin contexto, la clasificación es desconocida y la regla falla cerrada: solo local.

En producción ``nube`` es ``None``: no existe adapter de nube. Los tests inyectan uno falso que cuenta invocaciones.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, TypeVar

from app.application.corpus_metadata.poblacion_puertos import LlmCompleto, RespuestaDelLlm
from app.application.ports import FalloDelLlm
from app.domain.reglas_proveedor import ProveedorLlm, proveedores_permitidos
from app.schemas.generated.models import LlmProvider, RagMeta

CLASIFICACION_DESCONOCIDA = ""
"""Sin ``con_clasificacion()`` activo: ``proveedores_permitidos`` la trata como no sintética (solo local)."""

T = TypeVar("T")


@dataclass
class ContextoDeProveedor:
    """Clasificación de la petición y proveedor que respondió; lo comparten todos los nodos de una misma petición."""

    clasificacion: str
    nube_usada: bool = False

    @property
    def proveedor_declarado(self) -> ProveedorLlm:
        """``meta.llmProvider`` / ``llmProvider``: ``nube`` si alguna llamada de la petición la usó, si no ``local``."""
        return ProveedorLlm.nube if self.nube_usada else ProveedorLlm.local

    def declarar_en(self, meta: RagMeta) -> RagMeta:
        """``meta`` con el proveedor que respondió (D3): el adapter que respondió, no el configurado."""
        return meta.model_copy(update={"llmProvider": LlmProvider(self.proveedor_declarado.value)})


_contexto: ContextVar[ContextoDeProveedor | None] = ContextVar(
    "contexto_de_proveedor", default=None
)


@contextmanager
def con_clasificacion(clasificacion: str) -> Iterator[ContextoDeProveedor]:
    """Fija la clasificación de datos de la petición para los selectores que corran dentro del bloque.

    Si ya hay un contexto activo (bloque anidado) lo reutiliza: manda la clasificación del bloque más externo y el proveedor
    que responda queda registrado en él, nunca en un contexto interno que se descarta."""
    activo = _contexto.get()
    if activo is not None:
        yield activo
        return
    contexto = ContextoDeProveedor(clasificacion)
    marca = _contexto.set(contexto)
    try:
        yield contexto
    finally:
        _contexto.reset(marca)


class SelectorDeProveedorLlm:
    """Prueba los proveedores permitidos en orden; un ``FalloDelLlm`` de uno pasa al siguiente y, si no queda ninguno, se
    propaga sin detalle (los consumidores lo traducen a ``503 LOCAL_LLM_UNAVAILABLE``)."""

    def __init__(
        self, local: LlmCompleto, nube: LlmCompleto | None, *, nube_habilitada: bool
    ) -> None:
        self._local = local
        self._nube = nube
        self._nube_habilitada = nube_habilitada

    async def completar_json(
        self, usuario: str, esquema: Mapping[str, Any], *, sistema: str | None = None
    ) -> str:
        return await self._con_proveedores_permitidos(
            lambda llm: llm.completar_json(usuario, esquema, sistema=sistema)
        )

    async def completar_json_acotado(
        self,
        usuario: str,
        esquema: Mapping[str, Any],
        *,
        max_tokens: int,
        semilla: int,
        sistema: str | None = None,
    ) -> RespuestaDelLlm:
        return await self._con_proveedores_permitidos(
            lambda llm: llm.completar_json_acotado(
                usuario, esquema, max_tokens=max_tokens, semilla=semilla, sistema=sistema
            )
        )

    async def _con_proveedores_permitidos(self, llamar: Callable[[LlmCompleto], Awaitable[T]]) -> T:
        contexto = _contexto.get()
        clasificacion = contexto.clasificacion if contexto else CLASIFICACION_DESCONOCIDA
        for proveedor in proveedores_permitidos(clasificacion, self._nube_habilitada):
            adapter = self._local if proveedor is ProveedorLlm.local else self._nube
            if adapter is None:  # producción: la nube no tiene adapter
                continue
            try:
                respuesta = await llamar(adapter)
            except FalloDelLlm:
                continue
            if contexto is not None and proveedor is ProveedorLlm.nube:
                contexto.nube_usada = True
            return respuesta
        raise FalloDelLlm("ningún proveedor permitido respondió")
