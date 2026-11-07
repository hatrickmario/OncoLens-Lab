"""Relevancia de un dato crítico faltante en el chat (US-264, RN-29, RN-27): reglas puras, sin E/S.

El catálogo clínico versionado manda: qué dato pregunta el oncólogo y qué criterios de aplicabilidad lo usan se decide aquí,
sin LLM. Lo que sale de estas reglas es contenido determinista del bloque ``catalogo`` (exento de cita, glosario S6 §3).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, DestinoDelCriterio
from app.domain.lenguaje import normalizar_texto

_CAMPO_DEL_NOMBRE = "name"
"""Clave de ``destination.match`` que nombra al biomarcador; su valor es el término canónico de ``sinonimos.json``."""


@dataclass(frozen=True)
class DatoCritico:
    """Un ítem de ``datos-criticos.json`` con lo que necesita la regla: clave, etiqueta en español y su destino (RN-29)."""

    clave: str
    etiqueta: str
    destino: DestinoDelCriterio


@dataclass(frozen=True)
class TextosDelCatalogo:
    """Textos fijos de configuración del bloque ``catalogo`` (RN-22); ``<dato>``, ``<version>`` y ``<criterios>`` los rellena
    el código."""

    dato_critico: str
    criterios: str
    sin_criterio: str


def identificar_dato_critico(
    pregunta: str, datos: Sequence[DatoCritico], sinonimos: Mapping[str, str]
) -> DatoCritico | None:
    """El dato crítico del catálogo que nombra la pregunta; ``None`` si ninguno (nunca lo decide el LLM, RN-27).

    Un dato se nombra por su etiqueta, su clave, el término canónico de su biomarcador o un sinónimo de ese término
    (``sinonimos.json``), siempre como palabras completas del texto normalizado. Gana el término más largo; a igual
    longitud, el primero del catálogo."""
    texto = normalizar_texto(pregunta)
    elegido: DatoCritico | None = None
    mayor = 0
    for dato in datos:
        for termino in _terminos_del_dato(dato, sinonimos):
            if len(termino) > mayor and re.search(rf"\b{re.escape(termino)}\b", texto):
                elegido, mayor = dato, len(termino)
    return elegido


def _terminos_del_dato(dato: DatoCritico, sinonimos: Mapping[str, str]) -> set[str]:
    canonicos = {
        normalizar_texto(nombre) for nombre in dato.destino.coincidencia.get(_CAMPO_DEL_NOMBRE, ())
    }
    sinonimos_del_dato = {texto for texto, canonico in sinonimos.items() if canonico in canonicos}
    propios = {normalizar_texto(dato.etiqueta), normalizar_texto(dato.clave)}
    return {termino for termino in propios | canonicos | sinonimos_del_dato if termino}


def criterios_que_usan(
    dato: DatoCritico, criterios: Sequence[CriterioDeAplicabilidad]
) -> tuple[CriterioDeAplicabilidad, ...]:
    """Los criterios de ``aplicabilidad.json`` cuyo ``destination`` cubre el del dato (RN-29), en el orden del catálogo.

    Misma entidad; mismo campo (un dato sin campo, p. ej. ``PriorTreatment``, cubre cualquiera de la entidad); y, en las
    claves de ``match`` que ambos nombran, los valores del dato están entre los del criterio. Una clave que solo nombra uno
    de los dos no excluye: el criterio de HER2 no exige la prueba (IHQ/ISH) de la que habla el dato, y el criterio de ECOG
    no exige que el dato repita la escala."""
    return tuple(c for c in criterios if _cubre(c.destino, dato.destino))


def _cubre(criterio: DestinoDelCriterio, dato: DestinoDelCriterio) -> bool:
    if criterio.entidad != dato.entidad:
        return False
    if dato.campo is not None and criterio.campo != dato.campo:
        return False
    return all(
        set(dato.coincidencia[clave]) <= set(valores)
        for clave, valores in criterio.coincidencia.items()
        if clave in dato.coincidencia
    )


def texto_del_bloque_de_catalogo(
    dato: DatoCritico,
    criterios: Sequence[CriterioDeAplicabilidad],
    version_del_catalogo: str,
    textos: TextosDelCatalogo,
) -> str:
    """El bloque ``catalogo``: el dato es crítico en la versión vigente y qué criterios lo usan, o el texto fijo de que
    ninguno lo usa. Solo vocabulario del catálogo: nada clínico que el catálogo no diga."""
    primera = textos.dato_critico.replace("<dato>", dato.etiqueta).replace(
        "<version>", version_del_catalogo
    )
    segunda = (
        textos.criterios.replace("<criterios>", "; ".join(c.etiqueta_es for c in criterios))
        if criterios
        else textos.sin_criterio
    )
    return f"{primera} {segunda}"
