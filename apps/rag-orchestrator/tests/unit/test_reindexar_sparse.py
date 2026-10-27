"""Caso de uso ``ReindexarSparse`` (US-117b D2/D3): lotes, etapas y errores sin texto ni mensajes."""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reindexar_sparse import (
    FalloDeReindexacion,
    ReindexarSparse,
    ResumenDeReindexacion,
)
from app.application.ports import ChunkDelCorpus
from app.domain.corpus_seed.errores import VectorSparseVacio
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.ingesta import CodificadorSparseFalso


def _chunk(indice: int, *, vigente: bool = True) -> ChunkDelCorpus:
    return ChunkDelCorpus(
        chunk_id=f"d@1#{indice:04d}",
        document_id="d@1",
        dense_vector=[0.125] * 8,
        chunk_text=f"texto secreto {indice}",
        chunk_index=indice,
        section="",
        source_type="guideline",
        language="es",
        cancer_type_tags="mama",
        population="adulto",
        study_design="guia",
        published_year=2024,
        is_current=vigente,
        created_at_ms=1,
    )


def _almacen(*chunks: ChunkDelCorpus) -> AlmacenDeChunksEnMemoria:
    almacen = AlmacenDeChunksEnMemoria()
    almacen.upsert_chunks(list(chunks))
    return almacen


def _caso(almacen: AlmacenDeChunksEnMemoria, sparse: object, lote: int = 2) -> ReindexarSparse:
    return ReindexarSparse(almacen=almacen, codificador=sparse, lote=lote)  # type: ignore[arg-type]


def test_reindexa_cada_vigente_y_resume_solo_recuentos() -> None:
    almacen = _almacen(*(_chunk(i) for i in range(5)))

    resumen = _caso(almacen, CodificadorSparseFalso()).ejecutar()

    assert resumen == ResumenDeReindexacion(leidos=5, reindexados=5)
    assert all(c.sparse_vector for c in almacen.chunks.values())


def test_codifica_por_lote_con_el_tamano_configurado() -> None:
    almacen = _almacen(*(_chunk(i) for i in range(5)))
    sparse = CodificadorSparseFalso()

    _caso(almacen, sparse, lote=2).ejecutar()

    assert sparse.invocaciones == 3 and sparse.textos_codificados == 5


def test_sin_vigentes_no_invoca_al_codificador_y_resume_cero() -> None:
    almacen = _almacen(_chunk(0, vigente=False))
    sparse = CodificadorSparseFalso()

    resumen = _caso(almacen, sparse).ejecutar()

    assert resumen == ResumenDeReindexacion(0, 0) and sparse.invocaciones == 0
    assert not almacen.chunks["d@1#0000"].sparse_vector


def test_no_toca_los_chunks_no_vigentes() -> None:
    almacen = _almacen(_chunk(0), _chunk(1, vigente=False))

    _caso(almacen, CodificadorSparseFalso()).ejecutar()

    assert almacen.chunks["d@1#0000"].sparse_vector
    assert not almacen.chunks["d@1#0001"].sparse_vector


def test_un_lote_fuera_de_rango_se_rechaza_antes_de_codificar() -> None:
    almacen = _almacen(_chunk(0))
    sparse = CodificadorSparseFalso()

    with pytest.raises(FalloDeReindexacion) as fallo:
        _caso(almacen, sparse, lote=0).ejecutar()

    assert (fallo.value.etapa, fallo.value.clase) == ("leer_vigentes", "ValueError")
    assert sparse.invocaciones == 0


@pytest.mark.parametrize(
    ("donde", "etapa"),
    [
        ("listar_vigentes_paginado", "leer_vigentes"),
        ("reescribir_sparse", "reescribir"),
    ],
)
def test_un_fallo_del_almacen_nombra_la_etapa_y_la_clase_nunca_el_mensaje(
    donde: str, etapa: str
) -> None:
    almacen = _almacen(_chunk(0))
    almacen.fallar_en[donde] = ConnectionError("milvus://secreto:19530")

    with pytest.raises(FalloDeReindexacion) as fallo:
        _caso(almacen, CodificadorSparseFalso()).ejecutar()

    assert (fallo.value.etapa, fallo.value.clase) == (etapa, "ConnectionError")
    assert "secreto" not in str(fallo.value) and fallo.value.__cause__ is None


def test_un_fallo_del_codificador_nombra_la_etapa_codificar_y_no_escribe_nada() -> None:
    almacen = _almacen(_chunk(0))
    sparse = CodificadorSparseFalso()
    sparse.error = RuntimeError("texto secreto 0")

    with pytest.raises(FalloDeReindexacion) as fallo:
        _caso(almacen, sparse).ejecutar()

    assert (fallo.value.etapa, fallo.value.clase) == ("codificar", "RuntimeError")
    assert "secreto" not in str(fallo.value)
    assert not almacen.chunks["d@1#0000"].sparse_vector


def test_un_sparse_vacio_del_codificador_es_un_fallo_de_la_etapa_codificar() -> None:
    almacen = _almacen(_chunk(0))
    sparse = CodificadorSparseFalso()
    sparse.devolver_vacios = True

    with pytest.raises(FalloDeReindexacion) as fallo:
        _caso(almacen, sparse).ejecutar()

    assert (fallo.value.etapa, fallo.value.clase) == ("codificar", VectorSparseVacio.__name__)
    assert not almacen.chunks["d@1#0000"].sparse_vector
