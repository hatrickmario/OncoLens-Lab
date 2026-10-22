"""Adapter de ``ProhibitedTermsChecker`` (RN-23): carga ``terminos-prohibidos.json`` del catálogo montado y delega en
``check_prohibited_terms`` (nivel A, sin frases permitidas).

Solo se revisan los campos GENERADOS (``CAMPOS_GENERADOS``); los copiados del corpus (``chunkTextSnapshot``, títulos,
fuentes) pueden contener legítimamente vocabulario de la lista y no pasan por aquí (decisión 79 del plan del S1).
"""

from __future__ import annotations

from pathlib import Path

from app.domain.lenguaje import ListaTerminos
from app.domain.support import CampoGenerado, coincidencias_en_campo_generado

RUTA_DE_LA_LISTA = Path("lenguaje") / "terminos-prohibidos.json"


class ListaDeTerminosNoDisponible(RuntimeError):
    """La lista versionada no se pudo leer o no es válida. El mensaje nunca lleva la ruta ni el contenido."""


class VerificadorDeTerminosProhibidos:
    """Implementa ``ProhibitedTermsChecker`` sobre una ``ListaTerminos`` ya validada."""

    def __init__(self, lista: ListaTerminos) -> None:
        self._lista = lista

    @property
    def version(self) -> str:
        return self._lista.version

    def reglas_coincidentes(self, texto: str, campo: CampoGenerado) -> tuple[str, ...]:
        coincidencias = coincidencias_en_campo_generado(texto, campo, self._lista, ("A",))
        return tuple(dict.fromkeys(c.id for c in coincidencias))


def cargar_lista_de_terminos(catalogos: Path) -> ListaTerminos:
    """Lee y valida ``<catálogos>/lenguaje/terminos-prohibidos.json`` (``CLINICAL_CATALOG_PATH``, solo lectura)."""
    try:
        return ListaTerminos.model_validate_json(
            (catalogos / RUTA_DE_LA_LISTA).read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        raise ListaDeTerminosNoDisponible("terminos-prohibidos.json no está disponible") from None


def cargar_verificador_de_terminos(catalogos: Path) -> VerificadorDeTerminosProhibidos:
    return VerificadorDeTerminosProhibidos(cargar_lista_de_terminos(catalogos))
