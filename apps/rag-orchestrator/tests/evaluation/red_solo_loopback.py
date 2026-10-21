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
        monkeypatch.setattr(socket, "getaddrinfo", self._resolver(socket.getaddrinfo))

    def _guardar(self, nombre: str, original: Callable[..., Any]) -> Callable[..., Any]:
        def conexion(yo: socket.socket, direccion: Any, *args: Any) -> Any:
            if not _es_loopback(direccion):
                self.intentos.append(f"socket.{nombre}")
                raise OSError("red bloqueada: solo se admite loopback")
            return original(yo, direccion, *args)

        return conexion

    def _resolver(self, original: Callable[..., Any]) -> Callable[..., Any]:
        def getaddrinfo(host: Any, *args: Any, **kwargs: Any) -> Any:
            if host is not None and not _es_loopback((host,)):
                self.intentos.append("socket.getaddrinfo")
                raise OSError("red bloqueada: solo se resuelve loopback")
            return original(host, *args, **kwargs)

        return getaddrinfo
