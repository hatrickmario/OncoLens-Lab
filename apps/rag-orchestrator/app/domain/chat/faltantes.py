"""Verbalización determinista del turno de faltantes (US-263, glosario S6 §3): reglas puras, sin E/S ni LLM.

Backend 1 es dueño de la clasificación (``gapType``, ``clasificarVacio``); aquí solo se convierte cada vacío en un bloque
``faltante`` con una plantilla fija. Las plantillas describen el vacío respecto de los documentos procesados, nunca una
afirmación sobre el paciente (nada de «ausente en el paciente»). Los bloques son deterministas (catálogo versionado),
sin citas ni ``factRefs``, y están exentos de cita (RN-01).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum

from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque

PLANTILLA_SIN_FALTANTES = "No faltan datos críticos según el catálogo {version}."
"""Un único bloque ``limitacion`` (respuesta fija «sin datos»), con la versión del catálogo que se consultó."""

_NOMBRE_DEL_TIPO_DE_DOCUMENTO = {"historia_clinica": "historia clínica", "examen": "examen"}


class TipoDeVacio(StrEnum):
    """Los tipos de vacío de ``gapType`` (glosario S6 §2); cada uno tiene su plantilla."""

    no_encontrado = "no_encontrado"
    incompleto = "incompleto"
    por_conciliar = "por_conciliar"
    no_buscado = "no_buscado"


@dataclass(frozen=True)
class ItemDeCompletitud:
    """Un dato esperado del caso tal como llega en ``completeness[]``: sin procedencia ni valores del paciente."""

    clave: str
    etiqueta: str
    estado: str
    tipo_de_vacio: TipoDeVacio | None


def _no_encontrado(etiqueta: str, fuentes: str) -> str:
    donde = f" ({fuentes})" if fuentes else ""
    return f"{etiqueta}: no se halló en los documentos procesados{donde}."


def _no_buscado(etiqueta: str, fuentes: str) -> str:
    de_que_tipo = f"de tipo {fuentes}" if fuentes else "que pueda contenerlo"
    return f"{etiqueta}: aún no se ha procesado ningún documento {de_que_tipo}."


def _incompleto(etiqueta: str, _fuentes: str) -> str:
    return f"{etiqueta}: el dato está incompleto o sin verificar."


def _por_conciliar(etiqueta: str, _fuentes: str) -> str:
    return f"{etiqueta}: hay registros en conflicto por conciliar."


_PLANTILLAS: Mapping[TipoDeVacio, Callable[[str, str], str]] = {
    TipoDeVacio.no_encontrado: _no_encontrado,
    TipoDeVacio.no_buscado: _no_buscado,
    TipoDeVacio.incompleto: _incompleto,
    TipoDeVacio.por_conciliar: _por_conciliar,
}
"""Una plantilla fija por tipo de vacío (versionada con el código): del catálogo salen solo etiquetas y tipos de documento."""


def segun_el_catalogo(
    items: Sequence[ItemDeCompletitud], etiquetas: Mapping[str, str]
) -> tuple[ItemDeCompletitud, ...]:
    """Falla cerrado: la etiqueta sale del catálogo montado (nunca del texto de la petición) y un ítem que el catálogo no
    conoce se descarta (RN-23, RN-29)."""
    return tuple(
        replace(item, etiqueta=etiquetas[item.clave]) for item in items if item.clave in etiquetas
    )


def _nombres_de_los_tipos(tipos: Sequence[str]) -> str:
    return " o ".join(_NOMBRE_DEL_TIPO_DE_DOCUMENTO.get(tipo, tipo) for tipo in tipos)


def _en_el_orden_del_catalogo(
    items: Sequence[ItemDeCompletitud], orden: Sequence[str]
) -> list[ItemDeCompletitud]:
    """El orden del catálogo; un ítem que el catálogo no conoce va al final, en el orden en que llegó."""
    posicion = {clave: indice for indice, clave in enumerate(orden)}
    return sorted(items, key=lambda item: posicion.get(item.clave, len(posicion)))


def verbalizar_faltantes(
    items: Sequence[ItemDeCompletitud],
    tipos_de_documento: Mapping[str, tuple[str, ...]],
    version_del_catalogo: str,
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque ``faltante`` por ítem con ``tipo_de_vacio`` no nulo (nunca un ``no_aplica``), en el orden del catálogo.

    Sin vacíos, un único bloque ``limitacion`` que dice que no faltan datos críticos y nombra la versión del catálogo."""
    con_vacio = [
        item for item in items if item.tipo_de_vacio is not None and item.estado != "no_aplica"
    ]
    if not con_vacio:
        return (
            BloqueDelTurno(
                TipoDeBloque.limitacion,
                PLANTILLA_SIN_FALTANTES.format(version=version_del_catalogo),
            ),
        )
    return tuple(
        BloqueDelTurno(
            TipoDeBloque.faltante,
            _PLANTILLAS[item.tipo_de_vacio](
                item.etiqueta, _nombres_de_los_tipos(tipos_de_documento.get(item.clave, ()))
            ),
        )
        for item in _en_el_orden_del_catalogo(con_vacio, list(tipos_de_documento))
    )
