"""Reglas de población en lista del catálogo montado (US-243, RN-22, RN-27): ``<tipo>/poblacion-reglas.json``.

Archivo opcional de datos versionados: ``restrictionMarkers`` (es/en) y, por criterio, ``synonyms`` (código canónico → textos
es/en), ``scale`` y ``groups`` (tabla ordenada de un criterio de rango). Si no existe, el criterio no reconoce restricción ni
sinónimos y lo que no mapea queda ``no_mapeado``. Si existe y no cumple su forma, el catálogo no está disponible: nunca se
lee a medias. Los mensajes no llevan la ruta ni el contenido.
"""

import json
from collections.abc import Mapping
from pathlib import Path
from types import MappingProxyType
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.domain.criterios_aplicabilidad import ReglasDePoblacion
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO_DE_REGLAS = "poblacion-reglas.json"

_CLAVE = r"^[a-z0-9_]+$"


def _sin_repetidos(valores: list[str]) -> list[str]:
    if len(set(valores)) != len(valores):
        raise ValueError("valores repetidos")
    return valores


_Texto = Annotated[str, Field(min_length=1)]
_ListaUnica = Annotated[list[_Texto], Field(min_length=1), AfterValidator(_sin_repetidos)]


class _Estricto(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class _Marcadores(_Estricto):
    es: list[_Texto] = []
    en: list[_Texto] = []


class _ReglasDelCriterio(_Estricto):
    synonyms: dict[Annotated[str, Field(pattern=_CLAVE)], _ListaUnica] = {}
    scale: _ListaUnica | None = None
    groups: dict[_Texto, _ListaUnica] = {}


class _Archivo(_Estricto):
    version: str
    restrictionMarkers: _Marcadores = _Marcadores()
    disenosQueMezclan: list[_Texto] = []
    criteria: dict[Annotated[str, Field(pattern=_CLAVE)], _ReglasDelCriterio] = {}


class ReglasDePoblacionDelTipo:
    """Las reglas de población de un tipo de cáncer: marcadores comunes y tablas por clave de criterio."""

    def __init__(
        self,
        marcadores: tuple[str, ...] = (),
        disenos_que_mezclan: tuple[str, ...] = (),
        por_criterio: Mapping[str, _ReglasDelCriterio] | None = None,
    ) -> None:
        self._marcadores = marcadores
        self._disenos = disenos_que_mezclan
        self._por_criterio = dict(por_criterio or {})

    def de(self, clave_de_criterio: str) -> ReglasDePoblacion:
        """Las reglas del criterio; uno que el archivo no nombra solo hereda los marcadores de restricción."""
        reglas = self._por_criterio.get(clave_de_criterio, _ReglasDelCriterio())
        return ReglasDePoblacion(
            marcadores_de_restriccion=self._marcadores,
            sinonimos=MappingProxyType({c: tuple(t) for c, t in reglas.synonyms.items()}),
            escala=tuple(reglas.scale or ()),
            grupos=MappingProxyType({g: tuple(m) for g, m in reglas.groups.items()}),
            disenos_que_mezclan=self._disenos,
        )


def leer_reglas_de_poblacion(archivo: Path) -> ReglasDePoblacionDelTipo:
    """Lee ``poblacion-reglas.json``; un archivo ausente no es un error (sin reglas)."""
    if not archivo.is_file():
        return ReglasDePoblacionDelTipo()
    try:
        contenido = _Archivo.model_validate(json.loads(archivo.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        raise CatalogoNoDisponible(
            "poblacion-reglas.json no está disponible o no cumple su forma"
        ) from None
    marcadores = tuple(contenido.restrictionMarkers.es + contenido.restrictionMarkers.en)
    return ReglasDePoblacionDelTipo(
        marcadores, tuple(contenido.disenosQueMezclan), contenido.criteria
    )
