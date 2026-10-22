"""Verificador de términos prohibidos de la SUITE (RN-23, ADR-41 D4b): niveles A y B, sin frases permitidas."""

from __future__ import annotations

from pathlib import Path

from app.domain.lenguaje import ListaTerminos
from app.domain.support import CampoGenerado


class VerificadorEstricto:
    """Más estricto que el filtro de producción (solo nivel A): mide cuánto lenguaje dudoso produce el generador."""

    def __init__(self, lista: ListaTerminos) -> None:
        self._lista = lista

    def contiene_terminos(self, texto: str, campo: CampoGenerado) -> bool:
        raise NotImplementedError("no implementado")


def cargar_verificador_estricto(catalogos: Path) -> VerificadorEstricto:
    raise NotImplementedError("no implementado")
