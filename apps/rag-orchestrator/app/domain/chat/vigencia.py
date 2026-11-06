"""Vigencia de un hilo del chat (RN-22, design D2): regla pura, sin reloj propio (la hora la entrega quien llama)."""

from __future__ import annotations

from datetime import datetime


def hilo_vencido(ultima_actividad: datetime, ahora: datetime, ttl_segundos: int) -> bool:
    """``True`` si pasó MÁS de ``ttl_segundos`` desde la última actividad; justo en el límite el hilo sigue vivo."""
    return (ahora - ultima_actividad).total_seconds() > ttl_segundos
