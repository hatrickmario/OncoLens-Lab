"""Chunking de la semilla en TOKENS del modelo de embeddings (US-231b AC-8, ``[S1 resp. 38]``, ADR-39).

``ch-largo-1`` (FX-06a-c) es el pasaje largo sintético que repite ``ch-c-1`` hasta pasar de 1500 tokens de BGE-M3. En la
ruta rápida se cuenta con un ``tokenizer.json`` mínimo; con ``-m models``, con el tokenizer real de ``EMBEDDING_TOKENIZER_PATH``.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

from app.domain.corpus_seed.chunking import fragmentar
from app.infrastructure.models.onnx import TokenizadorDeArchivo
from app.infrastructure.tokenizer.de_archivo import TokenizadorDePiezas
from tests.support.inferencia_falsa import CH_C_1
from tests.support.onnx_minimo import tokenizer_json

TAMANO = 1024
SOLAPE = 64
OBJETIVO = 1500


def ch_largo_1(contar: Callable[[str], int]) -> str:
    """Repite ``ch-c-1`` (FX-06a-c) hasta que el tokenizer cuente al menos 1500 tokens."""
    texto = CH_C_1
    while contar(texto) < OBJETIVO:
        texto = f"{texto} {CH_C_1}"
    return texto


def _archivo_de_tokenizer(tmp_path: Path) -> Path:
    ruta = tmp_path / "tokenizer.json"
    ruta.write_bytes(tokenizer_json())
    return ruta


@pytest.mark.ac("US-231b", 8)
def test_ch_largo_1_se_trocea_en_al_menos_dos_chunks_de_hasta_1024_tokens_con_el_tokenizer_de_archivo(
    tmp_path: Path,
) -> None:
    tokenizador = TokenizadorDePiezas(_archivo_de_tokenizer(tmp_path))
    texto = ch_largo_1(lambda t: len(tokenizador.tokenizar(t)))

    chunks = fragmentar(texto, tokenizador, tamano=TAMANO, solape=SOLAPE)

    assert len(chunks) >= 2
    assert all(len(tokenizador.tokenizar(chunk)) <= TAMANO for chunk in chunks)


@pytest.mark.models
@pytest.mark.ac("US-231b", 8)
def test_ch_largo_1_se_trocea_en_al_menos_dos_chunks_de_hasta_1024_tokens_de_bge_m3() -> None:
    from app.config.settings import Settings

    ruta = Settings(_env_file=None, model_provider="local").embedding_tokenizer_path  # type: ignore[call-arg]
    assert ruta is not None, "EMBEDDING_TOKENIZER_PATH debe apuntar al tokenizer.json de BGE-M3"
    contador = TokenizadorDeArchivo(
        ruta
    )  # cuenta tokens con el mismo tokenizer que usa el embedder
    tokenizador = TokenizadorDePiezas(ruta)
    texto = ch_largo_1(lambda t: len(contador.codificar(t)) - 2)  # sin <s> ni </s>

    chunks = fragmentar(texto, tokenizador, tamano=TAMANO, solape=SOLAPE)

    assert len(chunks) >= 2
    assert all(len(contador.codificar(chunk)) - 2 <= TAMANO for chunk in chunks)
