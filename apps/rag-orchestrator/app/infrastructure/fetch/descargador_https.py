"""Descarga de un texto público por HTTPS desde un host permitido (US-059 D9, ``CORPUS_FETCH_ALLOWED_HOSTS``).

Es el único egreso del cargador. Solo HTTPS, solo hosts de la lista, sin seguir redirecciones (un 3xx a otro host
saltaría la lista), con tope de bytes y de tiempo. Los mensajes de error nombran el host, nunca la URL completa
(el camino puede identificar el documento) ni el contenido.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Collection
from urllib.parse import urlsplit

import httpx


class FuenteNoPermitida(RuntimeError):
    """La URL no es HTTPS o su host no está en ``CORPUS_FETCH_ALLOWED_HOSTS``."""


class FuenteNoDisponible(RuntimeError):
    """El host respondió con error, con un tipo que no es texto o con más bytes del tope.

    ``host`` es solo el nombre del servidor: el mensaje nunca lleva la ruta ni la URL completa.
    """

    def __init__(self, host: str, detalle: str) -> None:
        super().__init__(f"{host}: {detalle}")
        self.host = host


class DescargadorHttps:
    def __init__(
        self,
        cliente: httpx.Client,
        hosts_permitidos: Collection[str],
        max_bytes: int,
        deadline_s: float,
        reloj_monotonico: Callable[[], float] = time.monotonic,
    ) -> None:
        self._deadline_s = deadline_s
        self._reloj_monotonico = reloj_monotonico
        self._cliente = cliente
        self._hosts = frozenset(h.casefold() for h in hosts_permitidos)
        self._max_bytes = max_bytes

    def descargar_texto(self, url: str) -> str:
        host = self._host_permitido(url)
        inicio = self._reloj_monotonico()
        try:
            with self._cliente.stream("GET", url, follow_redirects=False) as respuesta:
                return self._leer(respuesta, host, inicio)
        except httpx.HTTPError as error:
            raise FuenteNoDisponible(host, type(error).__name__) from None

    def _host_permitido(self, url: str) -> str:
        """Host de la URL si es HTTPS, del puerto 443 (o sin puerto), sin credenciales y de la lista; si no, lanza."""
        partes = urlsplit(url)
        host = (partes.hostname or "").casefold()
        try:
            puerto = partes.port
        except ValueError:
            puerto = -1
        if (
            partes.scheme != "https"
            or host not in self._hosts
            or puerto not in (None, 443)
            or partes.username is not None
            or partes.password is not None
        ):
            raise FuenteNoPermitida(
                f"{host or 'sin host'}: no es HTTPS:443 sin credenciales o no está permitido"
            )
        return host

    def _leer(self, respuesta: httpx.Response, host: str, inicio: float) -> str:
        if respuesta.status_code != 200:
            raise FuenteNoDisponible(host, f"HTTP {respuesta.status_code}")
        if _tipo_de_medio(respuesta) != "text/plain":
            raise FuenteNoDisponible(host, "el contenido no es text/plain")
        cuerpo = bytearray()
        for bloque in respuesta.iter_bytes():
            cuerpo += bloque
            if len(cuerpo) > self._max_bytes:
                raise FuenteNoDisponible(host, f"supera {self._max_bytes} bytes")
            self._exigir_plazo(host, inicio)
        self._exigir_plazo(host, inicio)
        return bytes(cuerpo).decode("utf-8", errors="replace")

    def _exigir_plazo(self, host: str, inicio: float) -> None:
        """Plazo TOTAL de la descarga: un servidor que gotea bytes a tiempo no la retiene indefinidamente."""
        if self._reloj_monotonico() - inicio > self._deadline_s:
            raise FuenteNoDisponible(host, f"excede el plazo de {self._deadline_s:g} s")


def _tipo_de_medio(respuesta: httpx.Response) -> str:
    """Tipo de medio sin parámetros y en minúsculas (``text/plain; charset=utf-8`` -> ``text/plain``)."""
    return respuesta.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
