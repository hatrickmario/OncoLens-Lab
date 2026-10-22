"""Verificador de términos prohibidos de la SUITE (RN-23, ADR-41 D4b): niveles A y B, sin frases permitidas."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.lenguaje import Coincidencia, ListaTerminos, Nivel, check_prohibited_terms
from app.domain.support import CampoGenerado, coincidencias_en_campo_generado


class VerificadorEstricto:
    """Más estricto que el filtro de producción (solo nivel A): mide cuánto lenguaje dudoso produce el generador."""

    def __init__(self, lista: ListaTerminos, niveles: Sequence[Nivel] = ("A", "B")) -> None:
        self._lista = lista
        self._niveles = tuple(niveles)

    def contiene_terminos(self, texto: str, campo: CampoGenerado) -> bool:
        return bool(self.coincidencias_generadas(texto, campo))

    def coincidencias_generadas(self, texto: str, campo: CampoGenerado) -> list[Coincidencia]:
        return coincidencias_en_campo_generado(texto, campo, self._lista, self._niveles)

    def coincidencias_en(self, texto: str) -> list[Coincidencia]:
        """El vocabulario de la lista que trae un fragmento del corpus citado (para saber si el generador lo copia)."""
        return check_prohibited_terms(
            texto, self._lista, niveles=self._niveles, permitir_frases=False
        )
