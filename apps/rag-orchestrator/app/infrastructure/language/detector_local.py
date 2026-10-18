"""Detector de idioma local y determinista (``es`` / ``en``; ADR-39): sin red, sin modelo y sin estado aleatorio."""

from __future__ import annotations

from app.application.ports import Idioma


class DetectorDeIdiomaLocal:
    """``LanguageDetector``."""

    def __init__(self, idioma_por_defecto: Idioma) -> None:
        raise NotImplementedError

    def detectar(self, texto: str) -> Idioma:
        raise NotImplementedError
