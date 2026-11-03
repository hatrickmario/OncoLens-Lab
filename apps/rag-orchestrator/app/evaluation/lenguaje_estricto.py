"""Verificador de términos prohibidos de la SUITE (RN-23, ADR-41 D4b): lo propuesto con A y B, lo mostrado con la política.

Lo que PROPONE el generador se mide con todos los niveles (más estricto que el filtro: cuánto lenguaje dudoso produce);
lo que se MUESTRA se mide con la misma política que el filtro de producción (Nivel A y ``salidaGenerada.nivelB``, con la
cita textual atribuida y el sustantivo «recomendación» fuera): una sola fuente, ``ListaTerminos.reglas_para_salida_generada``
(US-249). Lo mostrado se mide sobre la RESPUESTA, así que un camino que dejara pasar texto sin filtrar se ve igual.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.lenguaje import (
    Coincidencia,
    FuenteCitada,
    ListaTerminos,
    Nivel,
    check_prohibited_terms,
)
from app.domain.support import (
    CampoGenerado,
    coincidencias_en_campo_generado,
    coincidencias_estrictas_en_campo_generado,
)


class VerificadorEstricto:
    """Mide cuánto lenguaje dudoso produce el generador (propuesta cruda) y cuánto queda en lo mostrado."""

    def __init__(self, lista: ListaTerminos, niveles: Sequence[Nivel] = ("A", "B")) -> None:
        self._lista = lista
        self._niveles = tuple(niveles)

    def contiene_terminos(self, texto: str, campo: CampoGenerado) -> bool:
        return bool(self.coincidencias_generadas(texto, campo))

    def coincidencias_generadas(self, texto: str, campo: CampoGenerado) -> list[Coincidencia]:
        """Lo propuesto tal cual: todos los niveles pedidos."""
        return coincidencias_estrictas_en_campo_generado(texto, campo, self._lista, self._niveles)

    def coincidencias_mostradas(
        self, texto: str, campo: CampoGenerado, fuentes: Sequence[FuenteCitada] = ()
    ) -> list[Coincidencia]:
        """Lo que la política de salida rechaza: Nivel A y ``salidaGenerada.nivelB``, con la cita atribuida de ``fuentes`` fuera."""
        return coincidencias_en_campo_generado(texto, campo, self._lista, fuentes)

    def coincidencias_en(self, texto: str) -> list[Coincidencia]:
        """El vocabulario de la lista que trae un fragmento del corpus citado (para saber si el generador lo copia)."""
        return check_prohibited_terms(
            texto, self._lista, niveles=self._niveles, permitir_frases=False
        )
