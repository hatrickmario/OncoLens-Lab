"""Cargador de la semilla (US-059, L1D-115) contra PostgreSQL ``corpus`` y Milvus de test reales.

Acceptance tests de los AC de US-059 sobre FX-06c-a: textos sintéticos, embeddings falsos deterministas con
``EMBEDDING_DIM = 8``, reloj e identificadores inyectados y congelados. Solo se fingen los bordes (embeddings).
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime

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

    def releases_publicadas(self) -> int:
        with self.motor.connect() as conexion:
            return int(
                conexion.execute(text("SELECT count(*) FROM corpus.corpus_release")).scalar_one()
            )

    def ids_en_la_release(self) -> list[str]:
        """Documentos de la release más reciente (la que vale hoy)."""
        consulta = text(
            "SELECT document_id FROM corpus.corpus_release_document WHERE release_id = "
            "(SELECT release_id FROM corpus.corpus_release ORDER BY published_at DESC, release_id DESC LIMIT 1) "
            "ORDER BY 1"
        )
        with self.motor.connect() as conexion:
            return list(conexion.execute(consulta).scalars())


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


def test_carga_de_semilla_con_el_modelo_caido_deja_error_en_el_catalogo_y_un_reintento_lo_carga(
    entorno: Entorno,
) -> None:
    entorno.embedder.error = ConnectionError("modelo no disponible")

    caido = entorno.cargar("t-ok-1")
    en_error = entorno.fila("t-ok-1")
    entorno.embedder.error = None
    reintento = entorno.cargar("t-ok-1")

    assert caido.hubo_errores and caido.release_id is None
    assert (en_error["status"], en_error["is_current"]) == ("error", False)
    assert reintento.de("t-ok-1").resultado is Resultado.CARGADO
    assert entorno.filas_del_catalogo() == 1 and entorno.fila("t-ok-1")["status"] == "embebido"


def test_carga_de_semilla_con_vectores_de_otra_dimension_los_rechaza_milvus_y_queda_error(
    entorno: Entorno,
) -> None:
    entorno.embedder.dimension = 16

    reporte = entorno.cargar("t-ok-1")

    assert reporte.de("t-ok-1").motivo == "milvus: DimensionDeVectorInvalida"
    assert entorno.fila("t-ok-1")["status"] == "error" and entorno.total_de_chunks() == 0


@pytest.mark.ac("US-059", 1)
def test_carga_de_semilla_publica_una_release_con_el_corte_de_configuracion_las_fuentes_excluidas_y_una_fila_por_vigente(
    entorno: Entorno,
) -> None:
    reporte = entorno.cargar("t-ok-1", "t-ok-2", "t-nd", "t-sin-licencia", "t-nccn")

    with entorno.motor.connect() as conexion:
        release = conexion.execute(text("SELECT * FROM corpus.corpus_release")).mappings().one()
    vigentes = sorted(str(entorno.fila(k)["document_id"]) for k in ("t-ok-1", "t-ok-2"))
    assert reporte.release_id == "release-1" == release["release_id"]
    assert (release["cutoff_date"], release["excluded_sources"], release["document_count"]) == (
        FECHA_DE_CORTE_DE_TEST,
        '["NCCN", "ESMO"]',
        2,
    )
    assert release["published_at"] == entorno.reloj.valor
    assert entorno.ids_en_la_release() == vigentes


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


@pytest.mark.ac("US-059", 4)
def test_carga_de_semilla_conserva_estadio_y_linea_de_t_ok_2_y_deja_t_ok_1_en_no_disponible(
    entorno: Entorno,
) -> None:
    entorno.cargar("t-ok-1", "t-ok-2")

    ok_1, ok_2 = entorno.fila("t-ok-1"), entorno.fila("t-ok-2")
    criterios_2 = ok_2["population_criteria"]
    assert isinstance(criterios_2, dict)
    assert {k: criterios_2.get(k) for k in ("estadio", "linea")} == {
        "estadio": "metastasico",
        "linea": "primera",
    }
    assert ok_2["metadata_source"] == "fuente_estructurada"
    assert ok_1["population_criteria"] == dict.fromkeys(
        ("subtipo", "estadio", "linea", "biomarcadores", "edad", "ecog"), "no_disponible"
    )


@pytest.mark.ac("US-059", 5)
def test_carga_de_semilla_repetida_con_el_mismo_manifiesto_no_cambia_los_recuentos_ni_invoca_embeddings(
    entorno: Entorno,
) -> None:
    claves = ("t-ok-1", "t-ok-2", "t-nd", "t-sin-licencia", "t-nccn")
    entorno.cargar(*claves)
    documentos_antes, chunks_antes = entorno.filas_del_catalogo(), entorno.total_de_chunks()
    embeddings_antes = entorno.embedder.invocaciones

    segunda = entorno.cargar(*claves)

    assert (entorno.filas_del_catalogo(), entorno.total_de_chunks()) == (
        documentos_antes,
        chunks_antes,
    )
    assert entorno.embedder.invocaciones == embeddings_antes
    assert segunda.release_id is None and entorno.releases_publicadas() == 1
    assert [r.resultado for r in segunda.resultados] == [
        Resultado.OMITIDO,
        Resultado.OMITIDO,
        Resultado.RECHAZADO,
        Resultado.RECHAZADO,
        Resultado.RECHAZADO,
    ]


@pytest.mark.ac("US-059", 6)
def test_carga_de_semilla_con_t_ok_1_v2_la_deja_vigente_y_apaga_t_ok_1_y_sus_chunks_sin_borrar_nada(
    entorno: Entorno,
) -> None:
    entorno.cargar("t-ok-1")
    antes_t_ok_1 = entorno.fila("t-ok-1")
    chunks_de_t_ok_1 = entorno.chunks_de(antes_t_ok_1["document_id"])
    filas_antes = entorno.filas_del_catalogo()
    instante_de_la_v2 = datetime(2026, 10, 17, 9, 30, tzinfo=UTC)
    entorno.reloj.valor = instante_de_la_v2

    entorno.cargar("t-ok-1-v2")

    v1, v2 = entorno.fila("t-ok-1"), entorno.fila("t-ok-1-v2")
    assert (v2["is_current"], v2["status"]) == (True, "embebido")
    assert (v1["is_current"], v1["superseded_at"]) == (False, instante_de_la_v2)
    assert entorno.filas_del_catalogo() == filas_antes + 1
    chunks_apagados = entorno.chunks_de(v1["document_id"])
    assert {c["chunk_id"] for c in chunks_apagados} == {c["chunk_id"] for c in chunks_de_t_ok_1}
    assert chunks_apagados and not any(c["is_current"] for c in chunks_apagados)
    assert all(c["is_current"] for c in entorno.chunks_de(v2["document_id"]))
    assert entorno.ids_en_la_release() == [v2["document_id"]]


@pytest.mark.ac("US-059", 3)
def test_carga_de_semilla_rechaza_t_nccn_por_fuente_excluida_aunque_declare_licencia(
    entorno: Entorno,
) -> None:
    reporte = entorno.cargar("t-nccn", "t-ok-1")

    nccn, ok = entorno.fila("t-nccn"), entorno.fila("t-ok-1")
    assert (reporte.de("t-nccn").resultado, reporte.de("t-nccn").motivo) == (
        Resultado.RECHAZADO,
        "fuente_excluida",
    )
    assert nccn["status"] == "rechazado_licencia" and nccn["license"] == "Dominio público"
    assert entorno.chunks_de(nccn["document_id"]) == []
    assert entorno.ids_en_la_release() == [ok["document_id"]]
