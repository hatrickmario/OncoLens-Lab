"""Soportes de test del cargador de la semilla (US-059): fixture FX-06c-a, embedder falso y política de licencias.

El embedder falso cumple el contrato del puerto ``PassageEmbedder`` (un vector por texto, dimensión ``EMBEDDING_DIM``,
mismo orden) y, como el adapter real, falla con una excepción si el modelo no está disponible.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from datetime import date
from pathlib import Path

from app.config.settings import MAPA_DE_LICENCIAS_POR_DEFECTO
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from tests.support.milvus import DIMENSION_DE_TEST

DIRECTORIO_DE_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
MANIFIESTO_FX_06C_A = DIRECTORIO_DE_FIXTURES / "seed-manifest.yaml"
FUENTES_EXCLUIDAS_DE_TEST = ("NCCN", "ESMO")
FECHA_DE_CORTE_DE_TEST = date(2026, 10, 15)
TAMANO_DE_CHUNK_DE_TEST = 12  # palabras: cada texto sintético da 2 o 3 chunks
SOLAPE_DE_CHUNK_DE_TEST = 0


def documentos_fx_06c_a(*claves: str) -> tuple[DocumentoDeSemilla, ...]:
    """Documentos del fixture, en el orden pedido (todos si no se piden)."""
    todos = {d.document_key: d for d in leer_manifiesto(MANIFIESTO_FX_06C_A)}
    return tuple(todos[c] for c in claves) if claves else tuple(todos.values())


def documento_de_prueba(**cambios: object) -> DocumentoDeSemilla:
    """Documento sintético válido de mama con licencia NCI; ``cambios`` sustituye campos."""
    base: dict[str, object] = {
        "document_key": "d-1",
        "version_group_id": "d-1",
        "source_type": "guideline",
        "source_name": "NCI",
        "external_id": "sintetico",
        "title": "Documento sintético",
        "language": "es",
        "cancer_type_tags": ("mama",),
        "published_at": date(2025, 1, 15),
        "study_design": "guia",
        "population": "adulto",
        "original_format": "html",
        "license": "Texto de NCI libre de copyright",
        "texto": "Texto sintético.",
    }
    return DocumentoDeSemilla(**{**base, **cambios})  # type: ignore[arg-type]


def politica_de_test(
    *,
    permitir_cc_by_nc: bool = False,
    aceptadas: frozenset[str] = frozenset({"dominio_publico", "cc_by", "cc_by_sa"}),
) -> PoliticaDeLicencias:
    return PoliticaDeLicencias(
        aceptadas=aceptadas,
        excluidas=FUENTES_EXCLUIDAS_DE_TEST,
        mapa_de_clases=MAPA_DE_LICENCIAS_POR_DEFECTO,
        permitir_cc_by_nc=permitir_cc_by_nc,
    )


class EmbedderFalso:
    """``PassageEmbedder`` determinista: el vector sale del SHA-256 del texto. Cuenta las invocaciones."""

    def __init__(self, dimension: int = DIMENSION_DE_TEST) -> None:
        self.dimension = dimension
        self.invocaciones = 0
        self.textos_embebidos = 0
        self.error: Exception | None = None

    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        self.invocaciones += 1
        if self.error is not None:
            raise self.error
        self.textos_embebidos += len(textos)
        return [self._vector(texto) for texto in textos]

    def _vector(self, texto: str) -> list[float]:
        resumen = hashlib.sha256(texto.encode("utf-8")).digest()
        crudo = [resumen[i] + 1.0 for i in range(self.dimension)]  # >= 1: nunca el vector nulo
        norma = sum(x * x for x in crudo) ** 0.5
        return [x / norma for x in crudo]


class GeneradorDeIdsFijo:
    """``IdGenerator`` congelado: ``release-1``, ``release-2``… en orden (determinista)."""

    def __init__(self, prefijo: str = "release") -> None:
        self._prefijo = prefijo
        self._cuenta = 0

    def nuevo(self) -> str:
        self._cuenta += 1
        return f"{self._prefijo}-{self._cuenta}"
