"""Términos del caso para el segundo loop contextual (US-271, ADR-52, RN-27, RN-10, RN-11): regla pura, sin E/S.

Cada término sale del catálogo versionado: la etiqueta CIE-10 del tipo, el estadio TNM, el grado (Gleason/ISUP en próstata) y
el biomarcador principal con su valor. Un valor que el catálogo no conoce se descarta sin inventar código (RN-27); el texto
libre del expediente, el ``pseudoPatientId``, las fechas y la identidad nunca entran.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class CasoParaTerminos:
    """Lo mínimo del ``clinicalContext`` que ``terminos_del_caso`` consulta; el servicio lo arma desde la petición."""

    tipo_de_cancer: str
    sistema_de_estadificacion: str
    estadio: str
    grado: str | None
    biomarcadores: tuple[tuple[str, str], ...]
    """Pares ``(nombre, valor)`` del contexto, en el orden recibido."""


@dataclass(frozen=True)
class BiomarcadorDelCatalogo:
    """Un biomarcador de ``datos-criticos`` del tipo: cómo se llama en el contexto, el término de consulta y sus valores."""

    nombre: str
    termino: str
    valores: Mapping[str, str]
    """Valor normalizado -> valor canónico; vacío si el catálogo no declara valores del biomarcador."""


@dataclass(frozen=True)
class CatalogoDeTerminos:
    """Lo que el catálogo versionado ofrece como término de consulta, por tipo de cáncer."""

    etiqueta_de_tipo: Mapping[str, str]
    estadios: Mapping[str, Mapping[str, Mapping[str, str]]]
    """Tipo -> sistema de estadificación normalizado -> {estadio normalizado: canónico}."""
    grados: Mapping[str, tuple[str, ...]]
    """Tipo -> valores canónicos de Gleason/ISUP que pueden aparecer dentro del texto del grado."""
    biomarcadores: Mapping[str, tuple[BiomarcadorDelCatalogo, ...]]
    """Tipo -> biomarcadores en el orden de ``datos-criticos`` (el primero presente es el principal)."""


@dataclass(frozen=True)
class TerminosDelCaso:
    terminos: tuple[str, ...]
    campos: tuple[str, ...]


def terminos_del_caso(
    caso: CasoParaTerminos, catalogo: CatalogoDeTerminos, campos: Sequence[str]
) -> TerminosDelCaso:
    raise NotImplementedError("no implementado")
