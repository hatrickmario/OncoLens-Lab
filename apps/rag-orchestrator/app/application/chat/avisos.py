"""Avisos de IA del chat (RN-19, design D7): los emite siempre Backend 2, desde su configuración y sin punto final."""

from __future__ import annotations

from app.config.settings import Settings
from app.domain.chat.estado import Intencion


def avisos_del_turno(settings: Settings, intencion: Intencion) -> list[str]:
    """Los avisos de un turno con contenido generado; la única dueña del literal en el chat.

    «Verifique contra las fuentes» aplica a los datos del paciente y sus fuentes: solo va en la intención ``caso`` (PRD RN-19
    lo reserva al resumen del caso). Los mensajes del sistema (``fuera_de_alcance``, ``no_clasificada``) no son contenido
    generado y no llaman a esta función: llevan ``notices = []``."""
    avisos = [settings.chat_notice_ai, settings.chat_notice_academic]
    if intencion is Intencion.caso:
        avisos.append(settings.chat_notice_verify)
    return avisos
