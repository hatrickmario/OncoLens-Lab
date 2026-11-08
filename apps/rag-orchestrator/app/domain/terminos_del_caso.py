"""Términos del caso para el segundo loop contextual (US-271, ADR-52, RN-27, RN-10, RN-11): regla pura, sin E/S.

Cada término sale del catálogo versionado: la etiqueta CIE-10 del tipo, el estadio TNM, el grado (Gleason/ISUP en próstata) y
el biomarcador principal con su valor. Un valor que el catálogo no conoce se descarta sin inventar código (RN-27); el texto
libre del expediente, el ``pseudoPatientId``, las fechas y la identidad nunca entran.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.domain.expansion_contextual import (
    CAMPO_BIOMARCADOR_PRINCIPAL,
    CAMPO_ESTADIO,
    CAMPO_TIPO,
    CAMPOS_DE_EXPANSION,
)
from app.domain.lenguaje import normalizar_texto


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
    """Nombre normalizado (``normalizar_texto``) con que el catálogo lo reconoce en el contexto."""
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
    biomarcadores_no_anclables: Mapping[str, frozenset[str]] = field(default_factory=dict)
    """Tipo -> nombres normalizados que el catálogo declara no anclables en la consulta contextual (US-273)."""


@dataclass(frozen=True)
class TerminosDelCaso:
    terminos: tuple[str, ...]
    campos: tuple[str, ...]
    """Los campos del conjunto cerrado que aportaron al menos un término (el grado cuenta bajo ``estadio``)."""


def terminos_del_caso(
    caso: CasoParaTerminos, catalogo: CatalogoDeTerminos, campos: Sequence[str]
) -> TerminosDelCaso:
    """Los términos canónicos del catálogo para ``campos``, en el orden tipo, estadio (y grado), biomarcador principal.

    Sin ningún término devuelve tuplas vacías: no hay segunda recuperación. Los campos usados salen en orden canónico."""
    por_campo = {
        CAMPO_TIPO: _del_tipo(caso, catalogo),
        CAMPO_ESTADIO: (*_del_estadio(caso, catalogo), *_del_grado(caso, catalogo)),
        CAMPO_BIOMARCADOR_PRINCIPAL: _del_biomarcador_principal(caso, catalogo),
    }
    usados = tuple(c for c in CAMPOS_DE_EXPANSION if c in campos and por_campo[c])
    return TerminosDelCaso(tuple(t for c in usados for t in por_campo[c]), usados)


def _del_tipo(caso: CasoParaTerminos, catalogo: CatalogoDeTerminos) -> tuple[str, ...]:
    etiqueta = catalogo.etiqueta_de_tipo.get(caso.tipo_de_cancer)
    return (etiqueta,) if etiqueta else ()


def _del_estadio(caso: CasoParaTerminos, catalogo: CatalogoDeTerminos) -> tuple[str, ...]:
    sistemas = catalogo.estadios.get(caso.tipo_de_cancer, {})
    canonico = sistemas.get(normalizar_texto(caso.sistema_de_estadificacion), {}).get(
        normalizar_texto(caso.estadio)
    )
    return (canonico,) if canonico else ()


def _del_grado(caso: CasoParaTerminos, catalogo: CatalogoDeTerminos) -> tuple[str, ...]:
    """El valor del catálogo que aparece como palabras completas dentro del texto del grado (``ISUP 3`` no es ``ISUP 35``)."""
    if not caso.grado:
        return ()
    texto = normalizar_texto(caso.grado)
    for valor in catalogo.grados.get(caso.tipo_de_cancer, ()):
        if re.search(rf"(?<!\S){re.escape(normalizar_texto(valor))}(?!\S)", texto):
            return (valor,)
    return ()


def _del_biomarcador_principal(
    caso: CasoParaTerminos, catalogo: CatalogoDeTerminos
) -> tuple[str, ...]:
    """El primero del catálogo, por su orden, que el caso trae y que el catálogo no declara no anclable.

    Devuelve su término y, solo si es del catálogo, su valor (US-273: en próstata el PSA no ancla la consulta)."""
    del_caso = {normalizar_texto(nombre): valor for nombre, valor in reversed(caso.biomarcadores)}
    no_anclables = catalogo.biomarcadores_no_anclables.get(caso.tipo_de_cancer, frozenset())
    for biomarcador in catalogo.biomarcadores.get(caso.tipo_de_cancer, ()):
        if biomarcador.nombre in del_caso and biomarcador.nombre not in no_anclables:
            valor = biomarcador.valores.get(normalizar_texto(del_caso[biomarcador.nombre]))
            return (biomarcador.termino, valor) if valor else (biomarcador.termino,)
    return ()
