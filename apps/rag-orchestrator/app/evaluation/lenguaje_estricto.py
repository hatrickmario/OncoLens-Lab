"""Verificador de términos prohibidos de la SUITE (RN-23, ADR-41 D4b): niveles A y B, sin frases permitidas."""

from __future__ import annotations

from app.domain.lenguaje import Coincidencia, ListaTerminos, check_prohibited_terms
from app.domain.support import CAMPOS_GENERADOS, CampoGenerado


class VerificadorEstricto:
    """Más estricto que el filtro de producción (solo nivel A): mide cuánto lenguaje dudoso produce el generador."""

    def __init__(self, lista: ListaTerminos) -> None:
        self._lista = lista

    def contiene_terminos(self, texto: str, campo: CampoGenerado) -> bool:
        return bool(self.coincidencias_generadas(texto, campo))

    def coincidencias_generadas(self, texto: str, campo: CampoGenerado) -> list[Coincidencia]:
        """Solo revisa los campos GENERADOS: los copiados del corpus pueden traer vocabulario de la lista (RN-04)."""
        if campo not in CAMPOS_GENERADOS:
            return []
        return self.coincidencias_del_corpus(texto)

    def coincidencias_del_corpus(self, texto: str) -> list[Coincidencia]:
        """El vocabulario de la lista que trae un fragmento del corpus citado (para saber si el generador lo copia)."""
        return check_prohibited_terms(texto, self._lista, niveles=("A", "B"), permitir_frases=False)
