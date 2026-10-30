"""Decoradores de los puertos de ``RAGOrchestratorService`` para la suite: cronometran cada etapa (p95) y observan lo
que el servicio ve (ranking del reranker, propuesta cruda del generador) sin cambiar su comportamiento.

Lo observado vive solo en memoria: el reporte lleva agregados, nunca textos (RN-14).
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass, field

from app.application.ports import (
    ChunkEncontrado,
    ChunkSearch,
    CorpusCatalogReader,
    CorpusReleaseReader,
    EvidenceGenerator,
    EvidenciaGenerada,
    Idioma,
    LanguageDetector,
    NliClassifier,
    QueryEmbedder,
    ReleaseDelCorpus,
    Reranker,
    ResultadoDeRecuperacion,
)
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import FichaDeFuente
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.cronometro import Cronometro
from app.evaluation.retrieval_metrics import ChunkRecuperado
from app.schemas.generated.models import RagQueryInternalRequest


@dataclass
class Observaciones:
    """Lo que vio el servicio en cada consulta, por texto de pregunta."""

    rankings: dict[str, list[ChunkRecuperado]] = field(default_factory=dict)
    propuestas: dict[str, EvidenciaGenerada] = field(default_factory=dict)
    entregados: dict[str, frozenset[str]] = field(default_factory=dict)
    """Ids de los chunks sobre el umbral entregados al generador: el conjunto citable de esa consulta."""
    textos_entregados: dict[str, dict[str, str]] = field(default_factory=dict)
    """``chunk_id -> texto`` de lo entregado al generador: las premisas con las que se juzga su fidelidad."""
    generaciones: int = 0


class DetectorMedido:
    def __init__(self, interno: LanguageDetector, cronometro: Cronometro) -> None:
        self._interno, self._cronometro = interno, cronometro

    def detectar(self, texto: str) -> Idioma:
        return self._cronometro.medir("idioma", self._interno.detectar, texto)


class LectorReleaseMedido:
    def __init__(self, interno: CorpusReleaseReader, cronometro: Cronometro) -> None:
        self._interno, self._cronometro = interno, cronometro

    def release_vigente(self) -> ReleaseDelCorpus:
        return self._cronometro.medir("catalogo", self._interno.release_vigente)


class CatalogoMedido:
    def __init__(self, interno: CorpusCatalogReader, cronometro: Cronometro) -> None:
        self._interno, self._cronometro = interno, cronometro

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        return self._cronometro.medir("catalogo", self._interno.fichas_por_documento, document_ids)

    def poblacion_por_documento(
        self, document_ids: Collection[str]
    ) -> dict[str, PoblacionDelEstudio]:
        return self._cronometro.medir(
            "catalogo", self._interno.poblacion_por_documento, document_ids
        )


class EmbedderMedido:
    def __init__(self, interno: QueryEmbedder, cronometro: Cronometro) -> None:
        self._interno, self._cronometro = interno, cronometro

    @property
    def modelo(self) -> str:
        return self._interno.modelo

    def embeber(self, texto: str) -> Sequence[float]:
        return self._cronometro.medir("embeddings", self._interno.embeber, texto)


class BuscadorMedido:
    def __init__(self, interno: ChunkSearch, cronometro: Cronometro) -> None:
        self._interno, self._cronometro = interno, cronometro

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        return self._cronometro.medir("busqueda", self._interno.search_dense, vector, limit, filtro)


class RerankerObservado:
    def __init__(
        self, interno: Reranker, cronometro: Cronometro, observaciones: Observaciones
    ) -> None:
        self._interno, self._cronometro, self._obs = interno, cronometro, observaciones

    @property
    def version(self) -> str:
        return self._interno.version

    def puntuar(self, pregunta: str, candidatos: Sequence[ChunkEncontrado]) -> list[float]:
        puntajes = self._cronometro.medir("reranker", self._interno.puntuar, pregunta, candidatos)
        ranking = sorted(zip(candidatos, puntajes), key=lambda par: (-par[1], par[0].chunk_id))
        self._obs.rankings[pregunta] = [
            ChunkRecuperado(c.document_id, c.chunk_text, p) for c, p in ranking
        ]
        return puntajes


class GeneradorObservado:
    def __init__(
        self, interno: EvidenceGenerator, cronometro: Cronometro, observaciones: Observaciones
    ) -> None:
        self._interno, self._cronometro, self._obs = interno, cronometro, observaciones

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        self._obs.generaciones += 1
        evidencia = await self._cronometro.medir_async(
            "generacion", self._interno.generar, solicitud, recuperacion
        )
        self._obs.propuestas[solicitud.query] = evidencia
        self._obs.entregados[solicitud.query] = frozenset(
            c.chunk_id for c in recuperacion.chunks_sobre_umbral
        )
        self._obs.textos_entregados[solicitud.query] = {
            c.chunk_id: c.chunk_text for c in recuperacion.chunks_sobre_umbral
        }
        return evidencia


@dataclass
class LatenciasNli:
    """Latencia del NLI en ms (US-233a AC-7): por lote (una llamada a ``clasificar``) y por hipótesis (el lote repartido
    entre sus pares, incluidas las hipótesis de población)."""

    por_lote_ms: list[float] = field(default_factory=list)
    por_hipotesis_ms: list[float] = field(default_factory=list)


class NliMedido:
    def __init__(
        self,
        interno: NliClassifier,
        cronometro: Cronometro,
        latencias: LatenciasNli | None = None,
    ) -> None:
        self._interno, self._cronometro = interno, cronometro
        self.latencias = latencias or LatenciasNli()

    @property
    def version(self) -> str:
        return self._interno.version

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        resultados = self._cronometro.medir("nli", self._interno.clasificar, pares)
        if pares:  # un lote vacío no invoca el modelo: no tiene latencia que reportar
            duracion = self._cronometro.ultima_duracion_ms("nli")
            self.latencias.por_lote_ms.append(duracion)
            self.latencias.por_hipotesis_ms.extend([duracion / len(pares)] * len(pares))
        return resultados
