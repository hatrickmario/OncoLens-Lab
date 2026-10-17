"""Cargador de la semilla (US-059, L1D-115) contra PostgreSQL ``corpus`` y Milvus de test reales.

Acceptance tests de los AC de US-059 sobre FX-06c-a: textos sintéticos, embeddings falsos deterministas con
``EMBEDDING_DIM = 8``, reloj e identificadores inyectados y congelados. Solo se fingen los bordes (embeddings).
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from pymilvus import MilvusClient
from sqlalchemy import Engine, text

from app.application.seed_corpus.reporte import ReporteDeCarga, Resultado
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.config.settings import MilvusSettings
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.fakes import RelojFijo
from tests.support.pg import BaseDeTest
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

pytestmark = pytest.mark.servicios_reales


@dataclass
class Entorno:
    """El cargador armado con PostgreSQL y Milvus reales y los bordes falsos, más lo necesario para consultarlos."""

    motor: Engine
    cliente: MilvusClient
    coleccion: str
    embedder: EmbedderFalso
    reloj: RelojFijo
    cargador: SeedCorpusLoader

    def cargar(self, *claves: str) -> ReporteDeCarga:
        return self.cargador.cargar(documentos_fx_06c_a(*claves))

    def fila(self, document_key: str) -> dict[str, object]:
        """La única fila del catálogo del documento (su ``document_id`` empieza por la clave del manifiesto y ``@``)."""
        consulta = text(
            "SELECT * FROM corpus.corpus_document WHERE starts_with(document_id, :prefijo)"
        )
        with self.motor.connect() as conexion:
            filas = conexion.execute(consulta, {"prefijo": f"{document_key}@"}).mappings().all()
        assert len(filas) == 1, f"{document_key}: se esperaba una fila y hay {len(filas)}"
        return dict(filas[0])

    def filas_del_catalogo(self) -> int:
        with self.motor.connect() as conexion:
            return int(
                conexion.execute(text("SELECT count(*) FROM corpus.corpus_document")).scalar_one()
            )

    def chunks_de(self, document_id: object) -> list[dict[str, object]]:
        return self.cliente.query(
            self.coleccion,
            filter=f'document_id == "{document_id}"',
            output_fields=["chunk_id", "is_current", "source_type", "language", "cancer_type_tags"],
            consistency_level="Strong",
        )

    def total_de_chunks(self) -> int:
        self.cliente.flush(self.coleccion)
        return int(self.cliente.get_collection_stats(self.coleccion)["row_count"])

    def ids_en_la_release(self) -> list[str]:
        with self.motor.connect() as conexion:
            return list(
                conexion.execute(
                    text("SELECT document_id FROM corpus.corpus_release_document ORDER BY 1")
                ).scalars()
            )


@pytest.fixture
def entorno(
    base_migrada: BaseDeTest, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> Iterator[Entorno]:
    motor = crear_motor(base_migrada.url_runtime)
    almacen = MilvusRepository(cliente_milvus, ajustes_milvus)
    almacen.ensure_collection()
    embedder, reloj = EmbedderFalso(), RelojFijo()
    cargador = SeedCorpusLoader(
        catalogo=CorpusDocumentRepository(motor),
        chunks=almacen,
        embedder=embedder,
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        reloj=reloj,
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
    )
    yield Entorno(
        motor, cliente_milvus, ajustes_milvus.milvus_collection_name, embedder, reloj, cargador
    )
    with motor.begin() as conexion:
        for tabla in ("corpus_release_document", "corpus_release", "corpus_document"):
            conexion.execute(text(f"DELETE FROM corpus.{tabla}"))
    motor.dispose()


@pytest.mark.ac("US-059", 2)
def test_carga_de_semilla_rechaza_t_nd_y_t_sin_licencia_sin_chunks_y_sigue_con_t_ok_1(
    entorno: Entorno,
) -> None:
    reporte = entorno.cargar("t-nd", "t-sin-licencia", "t-ok-1")

    nd, sin_licencia, ok = (entorno.fila(k) for k in ("t-nd", "t-sin-licencia", "t-ok-1"))
    assert (nd["status"], sin_licencia["status"], ok["status"]) == (
        "rechazado_licencia",
        "rechazado_licencia",
        "embebido",
    )
    assert (reporte.de("t-nd").motivo, reporte.de("t-sin-licencia").motivo) == (
        "licencia_no_aceptada",
        "sin_licencia",
    )
    assert entorno.chunks_de(nd["document_id"]) == []
    assert entorno.chunks_de(sin_licencia["document_id"]) == []
    assert entorno.chunks_de(ok["document_id"]) != []
    assert entorno.ids_en_la_release() == [ok["document_id"]]
    assert reporte.de("t-ok-1").resultado is Resultado.CARGADO
