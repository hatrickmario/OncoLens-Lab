"""Descarga de un texto público por HTTPS desde un host permitido (US-059 D9, ``CORPUS_FETCH_ALLOWED_HOSTS``).

Es el único egreso del cargador. Solo HTTPS, solo hosts de la lista, sin seguir redirecciones (un 3xx a otro host
saltaría la lista), con tope de bytes y de tiempo. Los mensajes de error nombran el host, nunca la URL completa
(el camino puede identificar el documento) ni el contenido.
"""

from __future__ import annotations

from collections.abc import Collection
from urllib.parse import urlsplit

import httpx


class FuenteNoPermitida(RuntimeError):
    """La URL no es HTTPS o su host no está en ``CORPUS_FETCH_ALLOWED_HOSTS``."""


class FuenteNoDisponible(RuntimeError):
    """El host respondió con error, con un tipo que no es texto o con más bytes del tope."""


class DescargadorHttps:
    def __init__(
        self, cliente: httpx.Client, hosts_permitidos: Collection[str], max_bytes: int
    ) -> None:
        self._cliente = cliente
        self._hosts = frozenset(h.casefold() for h in hosts_permitidos)
        self._max_bytes = max_bytes

    def descargar_texto(self, url: str) -> str:
        partes = urlsplit(url)
        host = (partes.hostname or "").casefold()
        if partes.scheme != "https" or host not in self._hosts:
            raise FuenteNoPermitida(f"{host or 'sin host'}: no es HTTPS o no está permitido")
        try:
            with self._cliente.stream("GET", url, follow_redirects=False) as respuesta:
                return self._leer(respuesta, host)
        except httpx.HTTPError as error:
            raise FuenteNoDisponible(f"{host}: {type(error).__name__}") from None

    def _leer(self, respuesta: httpx.Response, host: str) -> str:
        if respuesta.status_code != 200:
            raise FuenteNoDisponible(f"{host}: HTTP {respuesta.status_code}")
        if not respuesta.headers.get("content-type", "").startswith("text/plain"):
            raise FuenteNoDisponible(f"{host}: el contenido no es text/plain")
        cuerpo = bytearray()
        for bloque in respuesta.iter_bytes():
            cuerpo += bloque
            if len(cuerpo) > self._max_bytes:
                raise FuenteNoDisponible(f"{host}: supera {self._max_bytes} bytes")
        return bytes(cuerpo).decode("utf-8", errors="replace")
