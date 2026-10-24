"""Alias efímeros de los chunks entregados a la generación (RN-04): reglas puras, sin E/S.

El LLM cita un alias corto (``C1``…``Cn``) en lugar de copiar un ``chunkId`` largo. El alias vive solo dentro de una
consulta: se traduce al ``chunkId`` real antes de validar la cita y no sale en ninguna respuesta, registro ni log (RN-06).
El alias es el único formato aceptado: cualquier otro texto, incluido un ``chunkId`` real, se traduce a una marca no
citable y no se repara nada «parecido».
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import NamedTuple

from app.domain.relevance import ChunkPuntuado, ordenar_por_relevancia

# Contiene un carácter que no puede aparecer en un ``chunkId`` del corpus: nunca coincide con un chunk recuperado,
# así que ``validar_citas`` clasifica la opción como ``cita_invalida`` (y no como ``sin_citas``).
CITA_NO_TRADUCIBLE = "«cita-no-traducible»"


class FragmentoConAlias(NamedTuple):
    alias: str
    chunk: ChunkPuntuado


@dataclass(frozen=True)
class TablaDeAlias:
    """Alias → chunk de una consulta, en el orden en que se presentan al LLM."""

    fragmentos: tuple[FragmentoConAlias, ...]

    def chunk_id_de(self, alias: str) -> str | None:
        return next((f.chunk.chunk_id for f in self.fragmentos if f.alias == alias), None)


def asignar_alias(chunks: Sequence[ChunkPuntuado]) -> TablaDeAlias:
    """``C1``… por ``relevance_score`` descendente y ``chunk_id`` ascendente: determinista para la misma entrada."""
    ordenados = ordenar_por_relevancia(chunks)
    return TablaDeAlias(
        tuple(FragmentoConAlias(f"C{n}", chunk) for n, chunk in enumerate(ordenados, start=1))
    )


def traducir_citas(tabla: TablaDeAlias, citas_crudas: Iterable[str]) -> tuple[str, ...]:
    """El ``chunkId`` real de cada alias citado; todo lo demás (alias inexistente, ``chunkId`` real) es no citable."""
    return tuple(tabla.chunk_id_de(cruda.strip()) or CITA_NO_TRADUCIBLE for cruda in citas_crudas)
