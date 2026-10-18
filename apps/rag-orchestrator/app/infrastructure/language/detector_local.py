"""Detector de idioma local y determinista (``es`` / ``en``; ADR-39): sin red, sin modelo y sin estado aleatorio."""

from __future__ import annotations

from app.application.ports import Idioma
from app.domain.idioma import detectar_idioma


class DetectorDeIdiomaLocal:
    """``LanguageDetector``: la regla vive en ``domain/idioma.py``; el idioma por defecto sale de la configuración."""

    def __init__(self, idioma_por_defecto: Idioma) -> None:
        self._idioma_por_defecto = idioma_por_defecto

    def detectar(self, texto: str) -> Idioma:
        return detectar_idioma(texto, self._idioma_por_defecto)
