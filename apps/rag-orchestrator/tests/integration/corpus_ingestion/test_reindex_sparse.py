"""``ingest reindex-sparse`` (US-117b AC-2, OL-02, FR-19): puebla el *sparse* de los chunks vigentes de la semilla del S1 sin
cambiar su ``chunk_id`` ni su *dense*. Sobre memoria y, donde existe el Compose de test, PostgreSQL y Milvus reales."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator, Mapping, Sequence
from pathlib import Path

import pytest

from app.application.corpus_ingestion.ports import AlmacenDeReindexacionSparse, ChunkParaReindexar
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from app.scripts import ingest
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.fakes import RelojFijo
from tests.support.ingesta import CodificadorSparseFalso
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    EmbedderFalso,
    GeneradorDeIdsFijo,
    documentos_fx_06c_a,
    politica_de_test,
)

LOTE = 2  # varias páginas con los pocos chunks de la semilla de test


@pytest.fixture
def entorno_de_reindexacion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", "local")
    monkeypatch.setenv("SPARSE_VECTOR_SOURCE", "modelo_embeddings")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_PATH", "/models/embeddings/sparse_linear.npz")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_SHA256", "ab" * 32)
    monkeypatch.setenv("CORPUS_SPARSE_REINDEX_BATCH_SIZE", str(LOTE))


def _cargar_semilla(montaje: Montaje, *claves: str, ids: GeneradorDeIdsFijo | None = None) -> None:
    """La semilla del S1 con el cargador de L1D-115: chunks vigentes SIN *sparse*."""
    SeedCorpusLoader(
        catalogo=montaje.catalogo,
        almacen_de_chunks=montaje.almacen,
        embedder=EmbedderFalso(),
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        reloj=RelojFijo(),
        ids=ids or GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
    ).cargar(documentos_fx_06c_a(*claves))


def _reindexar(
    montaje: Montaje,
    capsys: pytest.CaptureFixture[str],
    almacen: AlmacenDeReindexacionSparse | None = None,
) -> tuple[int, str, str]:
    capsys.readouterr()
    codigo = ingest.main(
        ["reindex-sparse"], sparse=montaje.sparse, almacen_sparse=almacen or montaje.almacen
    )
    capturado = capsys.readouterr()
    return codigo, capturado.out, capturado.err


@pytest.mark.ac("US-117b", 2)
def test_reindex_sparse_puebla_todos_los_vigentes_sin_cambiar_chunk_id_ni_dense_y_termina_con_0(
    entorno_de_reindexacion: None,
    capsys: pytest.CaptureFixture[str],
    fabrica_de_montaje: Callable[[Path], Montaje],
) -> None:
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
    _cargar_semilla(montaje, "t-ok-1", "t-ok-2")
    antes = montaje.registros_de_chunks()
    assert antes and all(not r.sparse for r in antes.values())

    codigo, salida, _ = _reindexar(montaje, capsys)

    despues = montaje.registros_de_chunks()
    assert codigo == 0
    assert set(despues) == set(antes)
    assert all(despues[i].dense == antes[i].dense for i in antes)
    esperado = CodificadorSparseFalso()
    for registro in despues.values():
        assert registro.sparse == pytest.approx(esperado.codificar([registro.chunk_text])[0])
    resumen = json.loads(salida)
    assert resumen["reindexados"] == resumen["leidos"] == len(antes)


def test_reindex_sparse_no_toca_los_chunks_no_vigentes(
    entorno_de_reindexacion: None,
    capsys: pytest.CaptureFixture[str],
    fabrica_de_montaje: Callable[[Path], Montaje],
) -> None:
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
    ids = GeneradorDeIdsFijo()  # una release por carga: ids distintos
    _cargar_semilla(montaje, "t-ok-1", ids=ids)
    _cargar_semilla(montaje, "t-ok-1-v2", ids=ids)
    antes = montaje.registros_de_chunks()
    no_vigentes = {i for i, r in antes.items() if not r.is_current}
    assert no_vigentes

    codigo, _, _ = _reindexar(montaje, capsys)

    despues = montaje.registros_de_chunks()
    assert codigo == 0 and set(despues) == set(antes)
    assert all(despues[i] == antes[i] for i in no_vigentes)
    assert all(despues[i].sparse for i, r in despues.items() if r.is_current)


def test_una_segunda_reindexacion_deja_los_mismos_vectores_y_el_mismo_recuento(
    entorno_de_reindexacion: None,
    capsys: pytest.CaptureFixture[str],
    fabrica_de_montaje: Callable[[Path], Montaje],
) -> None:
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
    _cargar_semilla(montaje, "t-ok-1", "t-ok-2")
    _reindexar(montaje, capsys)
    primera = montaje.registros_de_chunks()

    codigo, _, _ = _reindexar(montaje, capsys)

    assert codigo == 0 and montaje.registros_de_chunks() == primera


class AlmacenQueFallaAlReescribirElLote:
    """Envuelve un almacén (en memoria o Milvus real) y falla al reescribir el lote ``n`` (1 = el primero)."""

    def __init__(self, real: AlmacenDeReindexacionSparse, n: int) -> None:
        self._real, self._n, self._llamadas = real, n, 0

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]:
        return self._real.listar_vigentes_paginado(lote)

    def reescribir_sparse(
        self, chunks: Sequence[ChunkParaReindexar], vectores_sparse: Sequence[Mapping[int, float]]
    ) -> int:
        self._llamadas += 1
        if self._llamadas == self._n:
            raise ConnectionError("milvus://uri-secreta:19530 caído")
        return self._real.reescribir_sparse(chunks, vectores_sparse)


def test_milvus_que_falla_en_el_segundo_lote_sale_con_1_nombra_la_etapa_sin_uri_ni_texto_y_un_reintento_completa(
    entorno_de_reindexacion: None,
    capsys: pytest.CaptureFixture[str],
    fabrica_de_montaje: Callable[[Path], Montaje],
) -> None:
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
    _cargar_semilla(montaje, "t-ok-1", "t-ok-2")
    antes = montaje.registros_de_chunks()

    codigo, salida, error = _reindexar(
        montaje, capsys, AlmacenQueFallaAlReescribirElLote(montaje.almacen, 2)
    )

    assert codigo == 1 and salida == ""
    assert "reescribir" in error and "ConnectionError" in error
    assert "uri-secreta" not in error
    assert not any(r.chunk_text in error for r in antes.values())
    parcial = montaje.registros_de_chunks()
    assert set(parcial) == set(antes)
    assert all(
        (parcial[i].dense, parcial[i].is_current) == (antes[i].dense, antes[i].is_current)
        for i in antes
    )

    codigo, _, _ = _reindexar(montaje, capsys)

    assert codigo == 0
    assert all(r.sparse for r in montaje.registros_de_chunks().values() if r.is_current)
