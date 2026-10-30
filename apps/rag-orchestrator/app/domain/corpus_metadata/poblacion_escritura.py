"""Forma que la ingesta escribe en ``population_criteria`` y caché por versión (US-242, ADR-47, D5, D6, D10–D12).

El escritor emite solo dos formas por criterio (P5): la lista ``[{value, chunkId, scope, promptVersion, modelVersion,
catalogVersion, nliResult}]`` o la marca ``{"status": "pendiente", "values": []}``. Nunca ``{"values": […]}`` sin
``status``. ``population_form`` es informativa (P4): se escribe coherente con la estructura y se valida al escribir; el
lector sigue decidiendo por la forma del JSON.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any, Final

from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR
from app.domain.corpus_metadata.poblacion_abanico import ValorPropuesto
from app.domain.corpus_metadata.resultado import CampoDeMetadato, MetadatosResueltos
from app.domain.poblacion_del_estudio import ESTADO_PENDIENTE

FORMA_LISTA: Final = "lista"
FORMA_ANTIGUA: Final = "antigua"
CLAVES_DE_UN_VALOR: Final = frozenset(
    {"value", "chunkId", "scope", "promptVersion", "modelVersion", "catalogVersion", "nliResult"}
)
SEPARADOR_DEL_RESUMEN: Final = "; "


class FormaDePoblacionIncoherente(ValueError):
    """Lo que se iba a escribir no cumple la forma que declara. El mensaje es solo la clave del criterio (RN-14)."""


@dataclass(frozen=True)
class VersionesDeExtraccion:
    """Con qué se extrajo un valor: la caché por versión (AC-7) compara estas tres."""

    prompt: str
    modelo: str
    catalogo: str


def lista_de_criterio(
    valores: Sequence[ValorPropuesto], versiones: VersionesDeExtraccion
) -> list[dict[str, str]]:
    """La lista guardada de un criterio: cada valor con su fragmento, su alcance y su procedencia."""
    return [
        {
            "value": v.valor,
            "chunkId": v.chunk_id,
            "scope": v.alcance,
            "promptVersion": versiones.prompt,
            "modelVersion": versiones.modelo,
            "catalogVersion": versiones.catalogo,
            "nliResult": v.resultado_nli or "",
        }
        for v in valores
    ]


def marca_pendiente() -> dict[str, Any]:
    """Criterio cuya extracción falló tras el reintento (D5): una forma válida del lector, sin valores."""
    return {"status": ESTADO_PENDIENTE, "values": []}


def exigir_forma_de_lista(criterios: Mapping[str, Any]) -> None:
    """Valida la estructura antes de escribir ``population_form = lista``: lista de valores completos y acotados, o la
    marca ``pendiente`` exacta (P4, P5, P6). Lanza ``FormaDePoblacionIncoherente`` con la clave del criterio."""
    for clave, contenido in criterios.items():
        if isinstance(contenido, Mapping):
            if dict(contenido) != marca_pendiente():
                raise FormaDePoblacionIncoherente(clave)
        elif not isinstance(contenido, list) or not all(_es_valor_guardable(v) for v in contenido):
            raise FormaDePoblacionIncoherente(clave)


def _es_valor_guardable(valor: object) -> bool:
    return (
        isinstance(valor, Mapping)
        and set(valor) == CLAVES_DE_UN_VALOR
        and all(isinstance(v, str) for v in valor.values())
        and 0 < len(valor["value"]) <= LONGITUD_MAXIMA_DE_VALOR
    )


def criterios_con_valores(criterios: Mapping[str, Any]) -> tuple[str, ...]:
    """Claves de los criterios que guardan al menos un valor (no vacíos ni ``pendiente``)."""
    return tuple(c for c, v in criterios.items() if isinstance(v, list) and v)


def campos_de_poblacion(criterios: Mapping[str, Any]) -> tuple[CampoDeMetadato, ...]:
    """Un campo por criterio con valores, para ``extracted_fields`` y la muestra humana (M-08.4)."""
    return tuple(
        CampoDeMetadato(clave, SEPARADOR_DEL_RESUMEN.join(v["value"] for v in criterios[clave]))
        for clave in criterios_con_valores(criterios)
    )


def integrar_poblacion_en_abanico(
    metadatos: MetadatosResueltos, criterios: Mapping[str, Any]
) -> MetadatosResueltos:
    """Sustituye ``population_criteria`` por la forma de lista, ya validada, y suma sus campos a los verificados (D8)."""
    exigir_forma_de_lista(criterios)
    return replace(
        metadatos,
        population_criteria=dict(criterios),
        population_form=FORMA_LISTA,
        campos_verificados=(*metadatos.campos_verificados, *campos_de_poblacion(criterios)),
    )


def criterios_reutilizables(
    guardado: Mapping[str, Any], forma: str, claves: Sequence[str], versiones: VersionesDeExtraccion
) -> frozenset[str]:
    """Criterios de ``claves`` que NO hace falta volver a extraer (D6): están guardados en forma de lista con las mismas
    versiones de prompt, modelo y catálogo. Un criterio ``pendiente`` se reintenta.

    Una lista vacía solo se reutiliza si el documento guarda algún valor con las versiones vigentes: sin él no hay
    prueba de con qué versiones se extrajo ese «vacío»."""
    if forma != FORMA_LISTA:
        return frozenset()
    listas = {c: v for c, v in guardado.items() if c in claves and isinstance(v, list)}
    if not any(_con_versiones(v, versiones) for v in listas.values() if v):
        return frozenset()
    return frozenset(c for c, v in listas.items() if _con_versiones(v, versiones))


def _con_versiones(valores: Sequence[Any], versiones: VersionesDeExtraccion) -> bool:
    return all(
        isinstance(v, Mapping)
        and (v.get("promptVersion"), v.get("modelVersion"), v.get("catalogVersion"))
        == (versiones.prompt, versiones.modelo, versiones.catalogo)
        for v in valores
    )
