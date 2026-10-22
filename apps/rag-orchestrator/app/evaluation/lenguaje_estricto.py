"""Verificador de términos prohibidos de la SUITE (RN-23, ADR-41 D4b): niveles A y B, sin frases permitidas."""

from __future__ import annotations

from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.support import CAMPOS_GENERADOS, CampoGenerado


class VerificadorEstricto:
    """Más estricto que el filtro de producción (solo nivel A): mide cuánto lenguaje dudoso produce el generador."""

    def __init__(self, lista: ListaTerminos) -> None:
        self._lista = lista

    def contiene_terminos(self, texto: str, campo: CampoGenerado) -> bool:
        """Solo revisa los campos GENERADOS: los copiados del corpus pueden traer vocabulario de la lista (RN-04)."""
        if campo not in CAMPOS_GENERADOS:
            return False
        return bool(
            check_prohibited_terms(texto, self._lista, niveles=("A", "B"), permitir_frases=False)
        )
