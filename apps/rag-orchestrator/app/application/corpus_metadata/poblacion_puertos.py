"""Puertos y tipos de la extracción de población en abanico (US-242, ADR-47, D1).

El orquestador depende solo de estos puertos y de los de la aplicación (``NliClassifier``, ``CriteriosDeAplicabilidad``):
nunca de ``httpx``, ``onnxruntime`` ni SQLAlchemy.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from app.domain.corpus_metadata.poblacion_contadores import ContadoresDePoblacion
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad


@dataclass(frozen=True)
class Fragmento:
    """Un fragmento del corpus público: su ``chunk_id`` es el que Milvus indexa (RN-04)."""

    chunk_id: str
    texto: str


@dataclass(frozen=True)
class DocumentoParaExtraer:
    """Una única fuente por tarea (D2): la fija el código, nunca el modelo."""

    document_key: str
    document_id: str
    fragmentos: tuple[Fragmento, ...]


class RecuperadorDeFragmentos(Protocol):
    """Los fragmentos de UN documento (D2, D3). Nunca devuelve fragmentos de otro documento."""

    def todos(self, documento: DocumentoParaExtraer) -> tuple[Fragmento, ...]:
        """Todos los fragmentos del documento: los que valen para validar un ``chunkId``."""
        ...

    def relevantes(
        self, documento: DocumentoParaExtraer, criterio: CriterioDeAplicabilidad, k: int
    ) -> tuple[Fragmento, ...]:
        """Como máximo ``k`` fragmentos para el criterio, del más al menos relevante (orden determinista)."""
        ...


FINISH_REASON_CORTADA = "length"
"""Un ``finish_reason`` que no es ``stop``: el LLM agotó el tope de tokens y la salida está cortada (D5)."""


@dataclass(frozen=True)
class RespuestaDelLlm:
    """Texto crudo y motivo de fin (``stop``, ``length``…): ``length`` es una salida cortada (D5)."""

    texto: str
    finish_reason: str


class LlmDePoblacion(Protocol):
    """LLM local de la tarea corta. Un fallo (conexión, plazo, cuerpo inválido) es ``FalloDelLlm``, sin detalle."""

    async def completar_json_acotado(
        self, prompt: str, esquema: Mapping[str, Any], *, max_tokens: int, semilla: int
    ) -> RespuestaDelLlm: ...


@dataclass(frozen=True)
class PoblacionGuardada:
    """Lo que el catálogo guarda de la población de un documento: base de la caché por versión (D6)."""

    population_criteria: Mapping[str, Any]
    population_form: str
    metadata_source: str
    # Campos extraídos y verificados (muestra humana M-08.4): la refresca de la población los actualiza (US-242).
    extracted_fields: tuple[str, ...] = ()


class AlmacenDePoblacion(Protocol):
    """Lectura y reescritura de SOLO la población de un documento ya registrado (``corpus_document``)."""

    def leer_poblacion(self, document_id: str) -> PoblacionGuardada | None: ...

    def guardar_poblacion(
        self,
        document_id: str,
        population_criteria: Mapping[str, Any],
        population_form: str,
        extracted_fields: Sequence[str],
    ) -> None: ...


@dataclass(frozen=True)
class PoblacionExtraida:
    """Resultado de la extracción de un documento: lo que se escribe en ``population_criteria`` y sus contadores."""

    population_criteria: Mapping[str, Any]
    population_form: str
    contadores: ContadoresDePoblacion
    # Criterios con al menos un valor guardado: alimentan ``extracted_fields`` (muestra humana, M-08.4).
    criterios_con_valores: tuple[str, ...] = ()


class ExtractorDePoblacion(Protocol):
    """Lo que la ingesta pide al orquestador de la extracción en abanico (D8): la población de UN documento.

    ``guardado`` es lo que el catálogo ya tiene del documento (``None`` si no hay nada que reutilizar). Nunca lanza por
    un fallo del LLM o del NLI: el criterio afectado queda ``pendiente`` y el resto se guarda (RN-26).
    """

    def extraer(
        self,
        documento: DocumentoParaExtraer,
        tipos_de_cancer: Sequence[str],
        guardado: PoblacionGuardada | None,
    ) -> PoblacionExtraida: ...
