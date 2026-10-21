"""Bloqueo de sockets salientes salvo loopback durante la suite de evaluación (RN-12, ADR-41 D6).

Cada intento de conexión fuera de loopback se apunta y se rechaza con ``OSError``; el fixture autouse de
``conftest.py`` hace fallar el test que lo intentó, aunque el código bajo prueba haya tragado el error.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from typing import Any

import pytest


def _es_loopback(direccion: Any) -> bool:
    if not isinstance(direccion, tuple):  # AF_UNIX: ruta local
        return True
    host = str(direccion[0])
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class RedSoloLoopback:
    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.intentos: list[str] = []
        for nombre in ("connect", "connect_ex"):
            monkeypatch.setattr(
                socket.socket, nombre, self._guardar(nombre, getattr(socket.socket, nombre))
            )
        monkeypatch.setattr(
            socket.socket, "sendto", self._enviar("sendto", socket.socket.sendto, _direccion_sendto)
        )
        monkeypatch.setattr(
            socket.socket,
            "sendmsg",
            self._enviar("sendmsg", socket.socket.sendmsg, _direccion_sendmsg),
        )
        for nombre in ("getaddrinfo", "gethostbyname", "gethostbyname_ex"):
            monkeypatch.setattr(socket, nombre, self._resolver(nombre, getattr(socket, nombre)))

    def _guardar(self, nombre: str, original: Callable[..., Any]) -> Callable[..., Any]:
        def conexion(yo: socket.socket, direccion: Any, *args: Any) -> Any:
            self._exigir_loopback(f"socket.{nombre}", direccion)
            return original(yo, direccion, *args)

        return conexion

    def _enviar(
        self, nombre: str, original: Callable[..., Any], direccion_de: Callable[..., Any]
    ) -> Callable[..., Any]:
        def envio(yo: socket.socket, *args: Any) -> Any:
            direccion = direccion_de(args)
            if (
                direccion is not None
            ):  # sin dirección, el socket ya está conectado (y connect se vigila)
                self._exigir_loopback(f"socket.{nombre}", direccion)
            return original(yo, *args)

        return envio

    def _resolver(self, nombre: str, original: Callable[..., Any]) -> Callable[..., Any]:
        def resolver(host: Any, *args: Any, **kwargs: Any) -> Any:
            if host is not None:
                self._exigir_loopback(f"socket.{nombre}", (host,))
            return original(host, *args, **kwargs)

        return resolver

    def _exigir_loopback(self, intento: str, direccion: Any) -> None:
        if not _es_loopback(direccion):
            self.intentos.append(intento)
            raise OSError("red bloqueada: solo se admite loopback")


def _direccion_sendto(args: tuple[Any, ...]) -> Any:
    return args[-1] if len(args) >= 2 else None


def _direccion_sendmsg(args: tuple[Any, ...]) -> Any:
    return args[3] if len(args) > 3 else None
