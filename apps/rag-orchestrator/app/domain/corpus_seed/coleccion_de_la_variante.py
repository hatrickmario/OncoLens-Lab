"""El nombre de la colección de Milvus identifica la variante de contexto del chunk (US-279, L1D-337, D5, RN-22).

``ninguno`` usa el nombre base (hoy ``corpus_chunks``, la colección de ``l1d-119``) y las otras variantes, ``<base>__ctx_<variante>_v<plantilla>``.
La ingesta, la semilla y ``reindex-context`` comprueban la combinación al arrancar y fallan nombrando las dos variables: así un índice con
contexto nunca se mezcla con uno sin él ni con el de otra variante. No depende de Milvus.
"""

from __future__ import annotations

from typing import Final

from app.domain.corpus_seed.contexto_del_chunk import VERSION_DE_LA_PLANTILLA, VarianteDeContexto

MARCA_DE_CONTEXTO: Final = "__ctx_"


class ColeccionNoCorrespondeALaVariante(ValueError):
    """El mensaje es solo el NOMBRE de las variables, nunca sus valores."""

    def __init__(self) -> None:
        super().__init__("MILVUS_COLLECTION_NAME no corresponde a CORPUS_CHUNK_CONTEXT")


class OrigenIgualAlDestino(ValueError):
    """``reindex-context`` nunca lee y escribe la misma colección (RN-05)."""

    def __init__(self) -> None:
        super().__init__("--origen no puede ser la colección de MILVUS_COLLECTION_NAME")


def coleccion_de_la_variante(base: str, variante: VarianteDeContexto) -> str:
    """El nombre de la colección de ``variante`` a partir del nombre base."""
    if variante is VarianteDeContexto.NINGUNO:
        return base
    return f"{base}{_sufijo(variante)}"


def exigir_coleccion_de_la_variante(nombre: str, variante: VarianteDeContexto) -> None:
    """``ColeccionNoCorrespondeALaVariante`` si ``nombre`` no es el de la colección de ``variante``: ``ninguno`` no lleva marca de
    contexto; las otras terminan en el sufijo de SU variante y de la versión vigente de la plantilla, con un nombre base delante."""
    if variante is VarianteDeContexto.NINGUNO:
        corresponde = MARCA_DE_CONTEXTO not in nombre
    else:
        sufijo = _sufijo(variante)
        corresponde = nombre.endswith(sufijo) and len(nombre) > len(sufijo)
    if not corresponde:
        raise ColeccionNoCorrespondeALaVariante


def exigir_origen_distinto_del_destino(origen: str, destino: str) -> None:
    """``OrigenIgualAlDestino`` si son la misma colección (sin distinguir mayúsculas ni espacios en los extremos)."""
    if origen.strip().casefold() == destino.strip().casefold():
        raise OrigenIgualAlDestino


def _sufijo(variante: VarianteDeContexto) -> str:
    return f"{MARCA_DE_CONTEXTO}{variante.value}_v{VERSION_DE_LA_PLANTILLA}"
