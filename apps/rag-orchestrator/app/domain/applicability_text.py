"""Camino textual de la aplicabilidad (FR-25, US-123, RN-01): tipos puros, sin E/S.

El LLM solo **propone** el valor que el texto de la fuente da a un criterio; este módulo define qué se le entrega y qué
devuelve. Las reglas de validación (cita, lenguaje, soporte) y la normalización al catálogo se añaden aquí sin tocar
ningún puerto.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CriterioPendiente:
    """Un criterio del catálogo sobre el que la fuente no trae valor estructurado: solo su clave y sus etiquetas."""

    clave: str
    etiqueta_es: str
    etiqueta_en: str | None


@dataclass(frozen=True)
class ChunkDeFuente:
    """Un chunk recuperado de la fuente en esta consulta: lo único que una propuesta puede citar (RN-01)."""

    chunk_id: str
    texto: str


@dataclass(frozen=True)
class FuenteParaProponer:
    """Lo que el LLM recibe de cada fuente: sus criterios pendientes y sus chunks. Nunca datos del paciente (RN-11)."""

    external_id: str
    criterios: tuple[CriterioPendiente, ...]
    chunks: tuple[ChunkDeFuente, ...]


@dataclass(frozen=True)
class PropuestaDePoblacion:
    """Lo único que sobrevive de la salida del LLM: criterio, valor del estudio y ``chunkId`` citado (sin estado)."""

    external_id: str
    criterio: str
    valor: str
    chunk_id: str
