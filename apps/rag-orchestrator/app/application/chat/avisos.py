"""Avisos de IA del chat (RN-19, design D7): los emite siempre Backend 2, desde su configuración y sin punto final."""

from __future__ import annotations

from app.config.settings import Settings


def avisos_del_turno(settings: Settings) -> list[str]:
    """Los avisos de un turno con contenido generado; la única dueña del literal en el chat.

    Los mensajes del sistema (``fuera_de_alcance``, ``no_clasificada``) no son contenido generado y no llaman a esta
    función: llevan ``notices = []``."""
    return [settings.chat_notice_ai, settings.chat_notice_academic, settings.chat_notice_verify]
