"""Cargador de embeddings y sparse de la ingesta en lote (US-117a D3): verifica los pesos y comparte la sesión."""

from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest

from app.config.settings import CorpusIngestSettings
from app.infrastructure.models.local import cargar_embeddings_y_sparse_de_pasajes
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from tests.support.inferencia_falsa import TokenizadorFalso
from tests.support.modelos import (
    EntornoDeModelos,
    crear_entorno_de_modelos,
    fabricar_sesion_falsa,
    settings_de_modelos,
    sha256_de,
)


@pytest.fixture
def modelos(tmp_path: Path) -> EntornoDeModelos:
    return crear_entorno_de_modelos(tmp_path / "modelos")


def _npz(bias: float = 1.0) -> bytes:
    buffer = io.BytesIO()
    np.savez(
        buffer, weight=np.zeros((1, 1024), dtype=np.float32), bias=np.array([bias], np.float32)
    )
    return buffer.getvalue()


def _ajustes(
    directorio: Path, monkeypatch: pytest.MonkeyPatch, contenido: bytes
) -> CorpusIngestSettings:
    ruta = directorio / "sparse_linear.npz"
    ruta.write_bytes(contenido)
    for clave, valor in {
        "CORPUS_ACCEPTED_LICENSES": "dominio_publico",
        "CORPUS_EXCLUDED_SOURCES": "NCCN",
        "CORPUS_CUTOFF_DATE": "2026-10-16",
        "CORPUS_CHUNK_SIZE": "1024",
        "CORPUS_CHUNK_OVERLAP": "0",
        "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
        "EMBEDDING_SPARSE_WEIGHTS_PATH": str(ruta),
        "EMBEDDING_SPARSE_WEIGHTS_SHA256": sha256_de(contenido),
    }.items():
        monkeypatch.setenv(clave, valor)
    return CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]


def _cargar(modelos: EntornoDeModelos, ajustes: CorpusIngestSettings, sesiones: list[bytes]):
    fabrica = fabricar_sesion_falsa(1024)

    def contando(contenido: bytes, **opciones: object):
        sesiones.append(contenido)
        return fabrica(contenido, **opciones)

    return cargar_embeddings_y_sparse_de_pasajes(
        settings_de_modelos(modelos),
        ajustes,
        fabricar_sesion=contando,
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )


def test_entrega_embedder_y_sparse_sobre_una_sola_sesion(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sesiones: list[bytes] = []

    embedder, sparse = _cargar(modelos, _ajustes(tmp_path, monkeypatch, _npz()), sesiones)

    assert len(embedder.embeber(["her2"])[0]) == 1024
    assert len(sparse.codificar(["her2 mama"])[0]) >= 1
    assert len(sesiones) == 1


def test_nombra_la_variable_del_sha_cuando_los_pesos_sparse_estan_alterados(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ajustes = _ajustes(tmp_path, monkeypatch, _npz())
    ajustes.embedding_sparse_weights_path.write_bytes(b"alterado")

    with pytest.raises(ModeloNoVerificadoError) as error:
        _cargar(modelos, ajustes, [])

    assert error.value.variable == "EMBEDDING_SPARSE_WEIGHTS_SHA256"


def test_nombra_la_ruta_cuando_los_pesos_sparse_no_son_un_npz_valido(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ajustes = _ajustes(tmp_path, monkeypatch, b"no es un npz")

    with pytest.raises(ModeloNoVerificadoError) as error:
        _cargar(modelos, ajustes, [])

    assert error.value.variable == "EMBEDDING_SPARSE_WEIGHTS_PATH"


def test_nombra_la_ruta_cuando_el_archivo_de_pesos_sparse_no_existe(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ajustes = _ajustes(tmp_path, monkeypatch, _npz())
    ajustes.embedding_sparse_weights_path.unlink()

    with pytest.raises(ModeloNoVerificadoError) as error:
        _cargar(modelos, ajustes, [])

    assert error.value.variable == "EMBEDDING_SPARSE_WEIGHTS_PATH"
