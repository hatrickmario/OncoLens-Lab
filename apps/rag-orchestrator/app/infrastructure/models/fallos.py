"""Traducción de los fallos del runtime de inferencia al único error del puerto (US-231a, S1 resp. 12)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from app.application.ports import FalloDeInferencia


@contextmanager
def fallos_de_inferencia_como_error_del_puerto(mensaje: str) -> Iterator[None]:
    """Todo fallo del bloque sale como ``FalloDeInferencia(mensaje)``, sin texto de entrada ni causa encadenada.

    El mensaje del runtime puede llevar la pregunta, el chunk o una ruta: por eso se descarta (``from None``).
    """
    try:
        yield
    except FalloDeInferencia:
        raise
    except Exception:  # noqa: BLE001 - cualquier fallo del runtime es "modelo no disponible"
        raise FalloDeInferencia(mensaje) from None
