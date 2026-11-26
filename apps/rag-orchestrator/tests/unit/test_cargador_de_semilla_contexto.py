"""Cargador de la semilla con la variante de contexto del chunk (US-279, L1D-337, D3): la misma regla que la ingesta, un solo dueño."""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import (
    ConstructorDeterminista,
    ConstructorNinguno,
)
from app.application.corpus_ingestion.ports import ConstructorDeContexto
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.domain.corpus_seed.contexto_del_chunk import CONTEXTO_MAX_CHARS_INICIAL
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria, CatalogoEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.ingesta import EmbedderInterrumpible
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    GeneradorDeIdsFijo,
    documentos_fx_06c_a,
    politica_de_test,
)


def _cargar(
    constructor: ConstructorDeContexto | None,
) -> tuple[EmbedderInterrumpible, AlmacenDeChunksEnMemoria]:
    almacen, embedder = AlmacenDeChunksEnMemoria(), EmbedderInterrumpible()
    SeedCorpusLoader(
        catalogo=CatalogoEnMemoria(),
        almacen_de_chunks=almacen,
        embedder=embedder,
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        reloj=RelojFijo(),
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
        constructor_de_contexto=constructor,
    ).cargar(documentos_fx_06c_a("t-ok-1"))
    return embedder, almacen


def test_sin_constructor_la_semilla_embebe_el_texto_original_como_en_main() -> None:
    embedder, almacen = _cargar(None)

    assert embedder.textos_recibidos == [c.chunk_text for c in _en_orden(almacen)]


def test_con_ninguno_la_semilla_embebe_el_texto_original() -> None:
    embedder, almacen = _cargar(ConstructorNinguno())

    assert embedder.textos_recibidos == [c.chunk_text for c in _en_orden(almacen)]


def test_con_determinista_la_semilla_embebe_el_prefijo_y_guarda_el_texto_original() -> None:
    sin_contexto, almacen_base = _cargar(None)

    con_contexto, almacen = _cargar(ConstructorDeterminista(max_chars=CONTEXTO_MAX_CHARS_INICIAL))

    originales = [c.chunk_text for c in _en_orden(almacen)]
    assert originales == [c.chunk_text for c in _en_orden(almacen_base)]
    assert len(con_contexto.textos_recibidos) == len(originales) > 0
    for recibido, original in zip(con_contexto.textos_recibidos, originales, strict=True):
        assert recibido != original and recibido.endswith(f"\n\n{original}")
    assert sin_contexto.textos_recibidos == originales


def test_la_semilla_con_determinista_deja_los_mismos_chunk_id_que_sin_contexto() -> None:
    _, almacen_base = _cargar(None)

    _, almacen = _cargar(ConstructorDeterminista(max_chars=CONTEXTO_MAX_CHARS_INICIAL))

    assert set(almacen.chunks) == set(almacen_base.chunks)


def _en_orden(almacen: AlmacenDeChunksEnMemoria):
    return sorted(almacen.chunks.values(), key=lambda c: c.chunk_id)


@pytest.mark.parametrize("constructor", [None, ConstructorNinguno()])
def test_los_vectores_de_la_semilla_sin_contexto_son_los_del_texto_original(
    constructor: ConstructorDeContexto | None,
) -> None:
    embedder, almacen = _cargar(constructor)

    esperado = EmbedderInterrumpible().embeber([c.chunk_text for c in _en_orden(almacen)])
    assert [list(c.dense_vector) for c in _en_orden(almacen)] == esperado
    assert embedder.textos_recibidos
