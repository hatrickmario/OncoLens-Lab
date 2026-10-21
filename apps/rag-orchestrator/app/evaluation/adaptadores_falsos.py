"""Adapters falsos de la suite `evaluate` (``adaptadores.proveedor: fake``, FX-T5a-a): cumplen los puertos de
``app.application.ports`` con el mismo contrato que los reales (LSP): un puntaje por candidato y en [0, 1], el mismo
error al fallar, y ``None`` jamás se disfraza de ``0.0``. Deterministas y sin red; solo trabajan con datos sintéticos.
"""

from __future__ import annotations

import re
import unicodedata
import zlib
from collections.abc import Collection, Sequence
from datetime import date

from app.application.ports import (
    ChunkEncontrado,
    EvidenciaGenerada,
    ReleaseDelCorpus,
    ResultadoDeRecuperacion,
)
from app.domain.citations import FichaDeFuente, OpcionGenerada
from app.domain.corpus_seed.admisibilidad import PISO_DE_FUENTES_EXCLUIDAS
from app.domain.nli import ParNli, ResultadoNli
from app.domain.retrieval_filter import coincide_etiqueta, exigir_filtro_vigente
from app.evaluation.fuente_dataset import DatasetSuite
from app.schemas.generated.models import RagQueryInternalRequest

DIMENSION = 64
LONGITUD_MINIMA_DE_TOKEN = 4
COINCIDENCIAS_PARA_PUNTAJE_MAXIMO = 3
_FILTRO_TIPO = re.compile(r'cancer_type_tags == "(?P<tipo>[a-z][a-z0-9_]*)"')
_PALABRA = re.compile(r"\w+", re.UNICODE)


def tokens(texto: str) -> frozenset[str]:
    """Palabras de 4 o más letras, en minúsculas y sin tildes."""
    sin_tildes = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
    return frozenset(p for p in _PALABRA.findall(sin_tildes) if len(p) >= LONGITUD_MINIMA_DE_TOKEN)


class EmbedderBolsaDePalabras:
    modelo = "fake-bow@1"

    def embeber(self, texto: str) -> Sequence[float]:
        vector = [0.0] * DIMENSION
        for palabra in tokens(texto):
            vector[zlib.crc32(palabra.encode()) % DIMENSION] += 1.0
        norma = sum(x * x for x in vector) ** 0.5
        return [x / norma for x in vector] if norma else vector


class BuscadorEnMemoria:
    """``ChunkSearch`` sobre el corpus del dataset; aplica el filtro como Milvus (vigente y etiqueta completa)."""

    def __init__(self, dataset: DatasetSuite, embedder: EmbedderBolsaDePalabras) -> None:
        cancer = {d.id: d.cancer for d in dataset.documentos}
        self._chunks = [(c, cancer[c.documento], embedder.embeber(c.texto)) for c in dataset.chunks]

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        exigir_filtro_vigente(filtro or "is_current == true")
        tipo = _FILTRO_TIPO.search(filtro or "")
        candidatos = [
            (sum(a * b for a, b in zip(vector, v)), c)
            for c, cancer, v in self._chunks
            if tipo is None or coincide_etiqueta(cancer, tipo.group("tipo"))
        ]
        candidatos.sort(key=lambda par: (-par[0], par[1].id))
        return [
            ChunkEncontrado(c.id, c.documento, c.texto, similitud)
            for similitud, c in candidatos[:limit]
        ]


class RerankerLexico:
    version = "fake-lexical@1"

    def puntuar(self, pregunta: str, candidatos: Sequence[ChunkEncontrado]) -> list[float]:
        palabras = tokens(pregunta)
        return [
            min(
                1.0,
                len(palabras & tokens(c.chunk_text)) / COINCIDENCIAS_PARA_PUNTAJE_MAXIMO,
            )
            for c in candidatos
        ]


class NliLexico:
    """Implica la hipótesis cuando todas sus palabras están en la premisa; si no, es neutral."""

    version = "fake-nli@1"

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        return [
            ResultadoNli(label="entailment", p_entailment=0.97)
            if tokens(par.hipotesis) <= tokens(par.premisa)
            else ResultadoNli(label="neutral", p_entailment=0.02)
            for par in pares
        ]


class GeneradorGuionado:
    """``EvidenceGenerator`` con la salida cruda del dataset por pregunta; sin propuesta, no propone nada."""

    def __init__(self, dataset: DatasetSuite) -> None:
        texto_a_id = {p.texto: p.id for p in dataset.preguntas}
        self._por_texto = {
            texto: dataset.propuestas.get(pid, ()) for texto, pid in texto_a_id.items()
        }

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        propuestas = self._por_texto.get(solicitud.query, ())
        return EvidenciaGenerada(
            opciones=tuple(OpcionGenerada(p.opcion, p.justificacion, p.citas) for p in propuestas)
        )


class CatalogoEnMemoria:
    """``CorpusCatalogReader``: una ficha por documento del corpus sintético (títulos «(test)»)."""

    def __init__(self, dataset: DatasetSuite) -> None:
        self._fichas = {d.id: _ficha(d.id, d.titulo, dataset.corte) for d in dataset.documentos}

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        return {d: self._fichas[d] for d in document_ids if d in self._fichas}


def _ficha(documento: str, titulo: str, corte: date) -> FichaDeFuente:
    return FichaDeFuente(
        title=titulo,
        source_name="Corpus sintético (test)",
        external_id=documento,
        language="en",
        source_type="guideline",
        license_class="dominio_publico",
        study_design=None,
        trial_phase=None,
        primary_endpoint=None,
        sample_size=None,
        published_at=corte,
        last_updated_at=corte,
        guideline_version=None,
        authors=None,
        source_url=None,
    )


class LectorReleaseFijo:
    def __init__(self, dataset: DatasetSuite) -> None:
        self._release = ReleaseDelCorpus(dataset.release, dataset.corte, PISO_DE_FUENTES_EXCLUIDAS)

    def release_vigente(self) -> ReleaseDelCorpus:
        return self._release
