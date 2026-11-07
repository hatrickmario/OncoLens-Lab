"""Relevancia de un dato crítico faltante en el chat (US-264, RN-29, RN-27): reglas puras, sin E/S.

El catálogo clínico versionado manda: qué dato pregunta el oncólogo y qué criterios de aplicabilidad lo usan se decide aquí,
sin LLM. Lo que sale de estas reglas es contenido determinista del bloque ``catalogo`` (exento de cita, glosario S6 §3).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.criterios_aplicabilidad import DestinoDelCriterio


@dataclass(frozen=True)
class DatoCritico:
    """Un ítem de ``datos-criticos.json`` con lo que necesita la regla: clave, etiqueta en español y su destino (RN-29)."""

    clave: str
    etiqueta: str
    destino: DestinoDelCriterio
