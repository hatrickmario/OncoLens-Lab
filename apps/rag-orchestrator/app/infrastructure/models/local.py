"""Modelos locales de recuperación: verificación de los pesos y construcción de los adapters (MODEL_PROVIDER=local)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.application.ports import LanguageDetector, QueryEmbedder, Reranker
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.modelos import ConfigModelos
from app.config.settings import Settings
from app.domain.modelos import describir_modelo
from app.infrastructure.embeddings.bge_m3 import (
    EmbedderDeConsultaBgeM3,
    EmbedderDePasajesBgeM3,
    NucleoBgeM3,
)
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.models.onnx import SesionOnnx, TokenizadorDeArchivo
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador
from app.infrastructure.models.verificacion import ModeloNoVerificadoError, verificar_modelo
from app.infrastructure.reranker.bge_reranker import BgeReranker

# (variable de la ruta, variable del SHA-256) por cada archivo que se carga: modelo ONNX y tokenizer de cada modelo.
ARCHIVOS_A_VERIFICAR: tuple[tuple[str, str], ...] = (
    ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256"),
    ("EMBEDDING_TOKENIZER_PATH", "EMBEDDING_TOKENIZER_SHA256"),
    ("RERANKER_MODEL_PATH", "RERANKER_MODEL_SHA256"),
    ("RERANKER_TOKENIZER_PATH", "RERANKER_TOKENIZER_SHA256"),
)


class CandidatosSuperanLosParesDelReranker(RuntimeError):
    """``RETRIEVAL_TOP_K`` > ``RERANKER_MAX_PAIRS``: toda consulta con tantos candidatos daría 503. El mensaje nombra
    las dos variables y nunca sus valores."""

    def __init__(self) -> None:
        super().__init__("RETRIEVAL_TOP_K no puede superar RERANKER_MAX_PAIRS")


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
    """Verifica los pesos y construye los adapters. Falla con ``ModeloNoVerificadoError`` nombrando la variable.

    Las fábricas se inyectan para que la CI, que no tiene pesos reales (RN-14), ejercite el cableado completo.
    """
    config = _exigir_configuracion_de_modelos(settings)
    _exigir_candidatos_dentro_de_los_pares_del_reranker(settings.retrieval_top_k, config)
    rutas = verificar_modelos_locales(settings)
    sesion_embeddings, tokenizador_embeddings = _cargar_modelo(
        rutas, "EMBEDDING", settings.model_intra_op_threads, fabricar_sesion, fabricar_tokenizador
    )
    sesion_reranker, tokenizador_reranker = _cargar_modelo(
        rutas, "RERANKER", settings.model_intra_op_threads, fabricar_sesion, fabricar_tokenizador
    )
    nucleo = NucleoBgeM3(
        sesion_embeddings,
        tokenizador_embeddings,
        modelo=describir_modelo(
            config.embedding_model,
            config.embedding_model_revision,
            str(settings.embedding_model_sha256),
        ),
        dimension=config.embedding_dim,
        max_length=settings.embedding_max_length,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )
    reranker = BgeReranker(
        sesion_reranker,
        tokenizador_reranker,
        version=describir_modelo(
            config.reranker_model,
            config.reranker_model_revision,
            str(settings.reranker_model_sha256),
        ),
        max_length=config.reranker_max_length,
        max_pairs=config.reranker_max_pairs,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )
    return ModelosDeRecuperacion(
        detector_idioma=DetectorDeIdiomaLocal(settings.default_query_language),
        embedder_consulta=EmbedderDeConsultaBgeM3(nucleo),
        embedder_pasajes=EmbedderDePasajesBgeM3(nucleo),
        reranker=reranker,
    )


def verificar_modelos_locales(settings: Settings) -> dict[str, Path]:
    """Comprueba ruta y SHA-256 de cada archivo; el primero que falla termina el arranque nombrando su variable.

    Devuelve las rutas ya verificadas por nombre de variable: quien carga los modelos no vuelve a mirar ``Settings``.
    """
    rutas: dict[str, Path] = {}
    for variable_ruta, variable_sha in ARCHIVOS_A_VERIFICAR:
        ruta = getattr(settings, variable_ruta.lower())
        verificar_modelo(variable_ruta, variable_sha, ruta, getattr(settings, variable_sha.lower()))
        rutas[variable_ruta] = ruta
    return rutas


def _cargar_modelo(
    rutas: dict[str, Path],
    prefijo: str,
    hilos: int,
    fabricar_sesion: Callable[..., SesionDeInferencia],
    fabricar_tokenizador: Callable[[Path], Tokenizador],
) -> tuple[SesionDeInferencia, Tokenizador]:
    """Tokenizer y sesión de un modelo (``EMBEDDING`` o ``RERANKER``); el relleno de la sesión sale de su tokenizer."""
    variable_tokenizer, variable_modelo = f"{prefijo}_TOKENIZER_PATH", f"{prefijo}_MODEL_PATH"
    tokenizador = _construir(
        variable_tokenizer, lambda: fabricar_tokenizador(rutas[variable_tokenizer])
    )
    sesion = _construir(
        variable_modelo,
        lambda: fabricar_sesion(
            rutas[variable_modelo], hilos=hilos, id_relleno=tokenizador.id_relleno
        ),
    )
    return sesion, tokenizador


def _exigir_configuracion_de_modelos(settings: Settings) -> ConfigModelos:
    """Sin las claves de ADR-39 no hay modelo, revisión ni dimensión que declarar: el arranque se niega."""
    if settings.modelos is None:
        raise ModeloNoVerificadoError("EMBEDDING_MODEL") from None
    return settings.modelos


def _exigir_candidatos_dentro_de_los_pares_del_reranker(
    retrieval_top_k: int | None, config: ConfigModelos
) -> None:
    if retrieval_top_k is not None and retrieval_top_k > config.reranker_max_pairs:
        raise CandidatosSuperanLosParesDelReranker from None


def _construir[T](variable_ruta: str, construir: Callable[[], T]) -> T:
    """Un archivo corrupto o ilegible termina el arranque nombrando su variable; el motivo (con la ruta) no sale."""
    try:
        return construir()
    except ModeloNoVerificadoError:
        raise
    except Exception:  # noqa: BLE001 - el mensaje del runtime puede llevar la ruta
        raise ModeloNoVerificadoError(variable_ruta) from None
