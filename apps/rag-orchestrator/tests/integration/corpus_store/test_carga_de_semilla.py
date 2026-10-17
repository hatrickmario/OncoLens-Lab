"""Cargador de la semilla (US-059, L1D-115) contra PostgreSQL ``corpus`` y Milvus de test reales.

Acceptance tests de los AC de US-059 sobre FX-06c-a: textos sintéticos, embeddings falsos deterministas con
``EMBEDDING_DIM = 8``, reloj e identificadores inyectados y congelados. Solo se fingen los bordes (embeddings).
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, replace
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
from tests.support.almacenes_falsos import AlmacenConFallosInyectables
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
    almacen: AlmacenConFallosInyectables

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

    def filas_por_prefijo(self, prefijo: str) -> list[dict[str, object]]:
        consulta = text("SELECT * FROM corpus.corpus_document WHERE starts_with(document_id, :p)")
        with self.motor.connect() as conexion:
            return [dict(f) for f in conexion.execute(consulta, {"p": prefijo}).mappings()]

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

    def documentos_con_chunks_vigentes(self) -> set[str]:
        filas = self.cliente.query(
            self.coleccion,
            filter="is_current == true",
            output_fields=["document_id"],
            consistency_level="Strong",
        )
        return {fila["document_id"] for fila in filas}

    def total_de_chunks(self) -> int:
        """Entidades vivas con consistencia fuerte: ``row_count`` cuenta también las reescrituras (upsert) sin compactar."""
        filas = self.cliente.query(
            self.coleccion,
            filter="chunk_id != ''",
            output_fields=["count(*)"],
            consistency_level="Strong",
        )
        return int(filas[0]["count(*)"])

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
    real = MilvusRepository(cliente_milvus, ajustes_milvus)
    real.ensure_collection()
    almacen = AlmacenConFallosInyectables(real)
    embedder, reloj = EmbedderFalso(), RelojFijo()
    cargador = SeedCorpusLoader(
        catalogo=CorpusDocumentRepository(motor),
        almacen_de_chunks=almacen,
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
        motor,
        cliente_milvus,
        ajustes_milvus.milvus_collection_name,
        embedder,
        reloj,
        cargador,
        almacen,
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
    assert reintento.resultado_de("t-ok-1").resultado is Resultado.CARGADO
    assert entorno.filas_del_catalogo() == 1 and entorno.fila("t-ok-1")["status"] == "embebido"


def test_carga_de_semilla_con_vectores_de_otra_dimension_los_rechaza_milvus_y_queda_error(
    entorno: Entorno,
) -> None:
    entorno.embedder.dimension = 16

    reporte = entorno.cargar("t-ok-1")

    assert reporte.resultado_de("t-ok-1").motivo == "milvus: DimensionDeVectorInvalida"
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
    assert (reporte.resultado_de("t-nd").motivo, reporte.resultado_de("t-sin-licencia").motivo) == (
        "licencia_no_aceptada",
        "sin_licencia",
    )
    assert entorno.chunks_de(nd["document_id"]) == []
    assert entorno.chunks_de(sin_licencia["document_id"]) == []
    assert entorno.chunks_de(ok["document_id"]) != []
    assert entorno.ids_en_la_release() == [ok["document_id"]]
    assert reporte.resultado_de("t-ok-1").resultado is Resultado.CARGADO


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
    assert (reporte.resultado_de("t-nccn").resultado, reporte.resultado_de("t-nccn").motivo) == (
        Resultado.RECHAZADO,
        "fuente_excluida",
    )
    assert nccn["status"] == "rechazado_licencia" and nccn["license"] == "Dominio público"
    assert entorno.chunks_de(nccn["document_id"]) == []
    assert entorno.ids_en_la_release() == [ok["document_id"]]


def test_tras_un_fallo_real_al_apagar_la_anterior_una_tercera_version_deja_vigentes_solo_sus_chunks(
    entorno: Entorno,
) -> None:
    """Gemelo de integración (Milvus real) del Bloqueante RN-05 del Gate 2: v1 OK, v2 falla al apagar v1, v3 OK."""
    entorno.cargar("t-ok-1")
    entorno.almacen.fallar_al_apagar = ConnectionError("milvus caído")
    entorno.cargar("t-ok-1-v2")
    entorno.almacen.fallar_al_apagar = None
    v3 = replace(
        documentos_fx_06c_a("t-ok-1-v2")[0],
        document_key="t-ok-1-v3",
        texto="Tercera versión sintética del documento uno de mama.",
    )

    entorno.cargador.cargar([v3])

    id_v3 = str(entorno.fila("t-ok-1-v3")["document_id"])
    assert entorno.documentos_con_chunks_vigentes() == {id_v3}
    assert (
        entorno.fila("t-ok-1-v3")["is_current"] is True
        and entorno.fila("t-ok-1")["is_current"] is False
    )


def test_volver_al_texto_de_v1_tras_un_fallo_real_no_deja_chunks_vigentes_de_v2(
    entorno: Entorno,
) -> None:
    entorno.cargar("t-ok-1")
    entorno.almacen.fallar_al_apagar = ConnectionError("milvus caído")
    entorno.cargar("t-ok-1-v2")
    entorno.almacen.fallar_al_apagar = None

    entorno.cargar("t-ok-1")

    assert entorno.documentos_con_chunks_vigentes() == {str(entorno.fila("t-ok-1")["document_id"])}


@pytest.mark.parametrize(
    "cambios",
    [{"license": "CC BY-ND 4.0"}, {"source_name": "NCCN"}],
    ids=["licencia_nd", "fuente_excluida"],
)
def test_un_documento_embebido_que_vuelve_rechazado_deja_su_grupo_sin_vigentes_y_publica_release(
    entorno: Entorno, cambios: dict[str, object]
) -> None:
    """Decidido (usuario, 2026-10-20): un rechazo por licencia o fuente retira la versión vigente, sin borrar nada."""
    entorno.cargar("t-ok-1")
    cargado = entorno.fila("t-ok-1")
    chunks_antes = entorno.total_de_chunks()
    filas_antes = entorno.filas_del_catalogo()
    entorno.reloj.valor = datetime(2026, 10, 17, 9, 30, tzinfo=UTC)

    reporte = entorno.cargador.cargar([replace(documentos_fx_06c_a("t-ok-1")[0], **cambios)])

    retirado = next(
        f
        for f in entorno.filas_por_prefijo("t-ok-1@")
        if f["document_id"] == cargado["document_id"]
    )
    assert reporte.resultado_de("t-ok-1").retirada_de_vigente is True
    assert (retirado["is_current"], retirado["superseded_at"]) == (False, entorno.reloj.valor)
    assert entorno.documentos_con_chunks_vigentes() == set()
    assert entorno.total_de_chunks() == chunks_antes  # los chunks siguen existiendo
    assert entorno.filas_del_catalogo() == filas_antes + 1  # solo la fila del rechazo
    assert reporte.release_id is not None and entorno.ids_en_la_release() == []
    assert entorno.releases_publicadas() == 2
