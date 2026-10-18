"""Modelos locales de recuperación: verificación de los pesos y construcción de los adapters (MODEL_PROVIDER=local)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.application.ports import LanguageDetector, QueryEmbedder, Reranker
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.settings import Settings
from app.infrastructure.models.onnx import SesionOnnx, TokenizadorDeArchivo
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador
from app.infrastructure.models.verificacion import verificar_modelo

# (variable de la ruta, variable del SHA-256) por cada archivo que se carga: modelo ONNX y tokenizer de cada modelo.
ARCHIVOS_A_VERIFICAR: tuple[tuple[str, str], ...] = (
    ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256"),
    ("EMBEDDING_TOKENIZER_PATH", "EMBEDDING_TOKENIZER_SHA256"),
    ("RERANKER_MODEL_PATH", "RERANKER_MODEL_SHA256"),
    ("RERANKER_TOKENIZER_PATH", "RERANKER_TOKENIZER_SHA256"),
)


@dataclass(frozen=True)
class ModelosDeRecuperacion:
    """Los adapters reales de recuperación ya construidos (un núcleo de embeddings para los dos puertos)."""

    detector_idioma: LanguageDetector
    embedder_consulta: QueryEmbedder
    embedder_pasajes: PassageEmbedder
    reranker: Reranker


def cargar_modelos_locales(
    settings: Settings,
    *,
    fabricar_sesion: Callable[..., SesionDeInferencia] = SesionOnnx.desde_archivo,
    fabricar_tokenizador: Callable[[Path], Tokenizador] = TokenizadorDeArchivo,
) -> ModelosDeRecuperacion:
    raise NotImplementedError


def verificar_modelos_locales(settings: Settings) -> None:
    """Comprueba ruta y SHA-256 de cada archivo; el primero que falla termina el arranque nombrando su variable."""
    for variable_ruta, variable_sha in ARCHIVOS_A_VERIFICAR:
        verificar_modelo(
            variable_ruta,
            variable_sha,
            getattr(settings, variable_ruta.lower()),
            getattr(settings, variable_sha.lower()),
        )
