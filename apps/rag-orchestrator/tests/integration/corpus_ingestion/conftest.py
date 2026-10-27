"""Montaje de la ingesta (US-117a): el ``IngestionPipelineService`` real sobre catálogo y almacén.

Dos entornos con el mismo contrato (LSP):

* ``montaje`` (memoria): catálogo y almacén en memoria; los tests que miran sus estructuras internas lo usan.
* ``montaje_en_ambos`` (parametrizado): la misma suite sobre memoria Y sobre PostgreSQL ``corpus`` + Milvus de test
  reales (``servicios_reales``, solo donde existe el Compose de test: se ve en ``integration-rag``). Los tests que lo
  usan solo preguntan por la interfaz de observación de ``Montaje``.

Se fingen solo los bordes de modelos (*embeddings*, *sparse*); el reloj y los ids van congelados.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

import pytest
from sqlalchemy import text

from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras

# Fixtures de Milvus de test (están en corpus_store/conftest.py): se importan para que este directorio las vea.
from tests.integration.corpus_store.conftest import (  # noqa: F401
    ajustes_milvus,
    cliente_milvus,
    nueva_coleccion,
    uri_de_milvus,
)
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria, CatalogoEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B,
    CodificadorSparseFalso,
    EmbedderInterrumpible,
)
from tests.support.metadatos import UMBRAL_NLI_DE_TEST, FakeMetadataLlm, nli_de_metadatos
from tests.support.nli_falso import NliFalso
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    GeneradorDeIdsFijo,
    politica_de_test,
)


@dataclass(frozen=True)
class RegistroObservado:
    chunk_text: str
    is_current: bool
    dense: tuple[float, ...]
    sparse: dict[int, float]


class Observador(Protocol):
    """Lo que un test puede preguntar al catálogo y al almacén, sea cual sea su implementación."""

    def filas_de(self, clave: str) -> list[tuple[str, bool]]:
        """``(status, is_current)`` de cada fila del catálogo cuyo ``document_id`` empieza por ``<clave>@``."""
        ...

    def total_de_filas(self) -> int: ...

    def chunks_por_clave(self) -> dict[str, int]: ...

    def textos_de_chunks(self, claves: tuple[str, ...]) -> set[str]: ...

    def chunks_vigentes_por_clave(self) -> dict[str, int]: ...

    def registros_de_chunks(self) -> dict[str, RegistroObservado]:
        """Todos los chunks (vigentes o no) por ``chunk_id``, con lo que el *sparse* no debe alterar."""
        ...

    def superseded_at_de(self, clave: str) -> list[datetime | None]:
        """``superseded_at`` de cada fila del catálogo cuyo ``document_id`` empieza por ``<clave>@``."""
        ...


class ObservadorEnMemoria:
    def __init__(self, catalogo: CatalogoEnMemoria, almacen: AlmacenDeChunksEnMemoria) -> None:
        self._catalogo, self._almacen = catalogo, almacen

    def filas_de(self, clave: str) -> list[tuple[str, bool]]:
        return [
            (r.status, r.is_current)
            for i, r in self._catalogo.documentos.items()
            if i.split("@")[0] == clave
        ]

    def total_de_filas(self) -> int:
        return len(self._catalogo.documentos)

    def chunks_por_clave(self) -> dict[str, int]:
        cuenta: dict[str, int] = {}
        for chunk in self._almacen.chunks.values():
            clave = chunk.document_id.split("@")[0]
            cuenta[clave] = cuenta.get(clave, 0) + 1
        return cuenta

    def textos_de_chunks(self, claves: tuple[str, ...]) -> set[str]:
        return {
            c.chunk_text
            for c in self._almacen.chunks.values()
            if c.document_id.split("@")[0] in claves
        }

    def chunks_vigentes_por_clave(self) -> dict[str, int]:
        cuenta: dict[str, int] = {}
        for chunk in self._almacen.chunks.values():
            if chunk.is_current:
                clave = chunk.document_id.split("@")[0]
                cuenta[clave] = cuenta.get(clave, 0) + 1
        return cuenta

    def registros_de_chunks(self) -> dict[str, RegistroObservado]:
        return {
            c.chunk_id: RegistroObservado(
                c.chunk_text, c.is_current, tuple(c.dense_vector), dict(c.sparse_vector or {})
            )
            for c in self._almacen.chunks.values()
        }

    def superseded_at_de(self, clave: str) -> list[datetime | None]:
        return [
            r.superseded_at
            for i, r in self._catalogo.documentos.items()
            if i.split("@")[0] == clave
        ]


class ObservadorReal:
    """PostgreSQL ``corpus`` (como ``rag_corpus``) y Milvus de test, con consistencia fuerte."""

    def __init__(self, motor: Any, cliente: Any, coleccion: str) -> None:
        self._motor, self._cliente, self._coleccion = motor, cliente, coleccion

    def filas_de(self, clave: str) -> list[tuple[str, bool]]:
        consulta = text(
            "SELECT status, is_current FROM corpus.corpus_document WHERE starts_with(document_id, :p)"
        )
        with self._motor.connect() as conexion:
            return [(f[0], bool(f[1])) for f in conexion.execute(consulta, {"p": f"{clave}@"})]

    def total_de_filas(self) -> int:
        with self._motor.connect() as conexion:
            return int(
                conexion.execute(text("SELECT count(*) FROM corpus.corpus_document")).scalar_one()
            )

    def _chunks(self, campos: list[str]) -> list[dict[str, Any]]:
        return self._cliente.query(
            self._coleccion,
            filter="chunk_id != ''",
            output_fields=campos,
            consistency_level="Strong",
            limit=16384,
        )

    def chunks_por_clave(self) -> dict[str, int]:
        cuenta: dict[str, int] = {}
        for fila in self._chunks(["document_id"]):
            clave = fila["document_id"].split("@")[0]
            cuenta[clave] = cuenta.get(clave, 0) + 1
        return cuenta

    def textos_de_chunks(self, claves: tuple[str, ...]) -> set[str]:
        return {
            f["chunk_text"]
            for f in self._chunks(["document_id", "chunk_text"])
            if f["document_id"].split("@")[0] in claves
        }

    def chunks_vigentes_por_clave(self) -> dict[str, int]:
        cuenta: dict[str, int] = {}
        for fila in self._chunks(["document_id", "is_current"]):
            if fila["is_current"]:
                clave = fila["document_id"].split("@")[0]
                cuenta[clave] = cuenta.get(clave, 0) + 1
        return cuenta

    def registros_de_chunks(self) -> dict[str, RegistroObservado]:
        campos = ["chunk_id", "chunk_text", "is_current", "dense_vector", "sparse_vector"]
        return {
            f["chunk_id"]: RegistroObservado(
                f["chunk_text"],
                bool(f["is_current"]),
                tuple(f["dense_vector"]),
                {int(k): float(v) for k, v in (f["sparse_vector"] or {}).items()},
            )
            for f in self._chunks(campos)
        }

    def superseded_at_de(self, clave: str) -> list[datetime | None]:
        consulta = text(
            "SELECT superseded_at FROM corpus.corpus_document WHERE starts_with(document_id, :p)"
        )
        with self._motor.connect() as conexion:
            return [f[0] for f in conexion.execute(consulta, {"p": f"{clave}@"})]


@dataclass
class Montaje:
    catalogo: Any
    almacen: Any
    embedder: EmbedderInterrumpible
    sparse: CodificadorSparseFalso
    servicio: IngestionPipelineService
    directorio: Path
    observador: Observador
    llm_metadatos: FakeMetadataLlm
    nli_metadatos: NliFalso

    def ingerir(self, manifiesto: Path | None = None) -> ReporteDeIngesta:
        return self.servicio.ingerir(self.documentos(manifiesto))

    def documentos(self, manifiesto: Path | None = None) -> tuple[DocumentoDeSemilla, ...]:
        return leer_manifiesto(manifiesto or MANIFIESTO_FX_06C_B)

    def chunks_por_clave(self) -> dict[str, int]:
        """Chunks en el almacén por ``document_key`` (el id del documento es ``<clave>@<checksum>``)."""
        return self.observador.chunks_por_clave()

    def filas_de(self, clave: str) -> list[tuple[str, bool]]:
        return self.observador.filas_de(clave)

    def total_de_filas(self) -> int:
        return self.observador.total_de_filas()

    def textos_de_chunks(self, *claves: str) -> set[str]:
        return self.observador.textos_de_chunks(claves)

    def chunks_vigentes_por_clave(self) -> dict[str, int]:
        return self.observador.chunks_vigentes_por_clave()

    def superseded_at_de(self, clave: str) -> list[datetime | None]:
        return self.observador.superseded_at_de(clave)

    def registros_de_chunks(self) -> dict[str, RegistroObservado]:
        return self.observador.registros_de_chunks()


def _servicio(
    catalogo: Any,
    almacen: Any,
    directorio: Path,
    embedder: Any,
    sparse: Any,
    llm: FakeMetadataLlm,
    nli: NliFalso,
) -> IngestionPipelineService:
    return IngestionPipelineService(
        catalogo=catalogo,
        almacen_de_chunks=almacen,
        embedder=embedder,
        codificador_sparse=sparse,
        resolutor_de_metadatos=MetadataExtractionService(
            llm=llm, nli=nli, umbral_nli=UMBRAL_NLI_DE_TEST
        ),
        fuente=FuenteDeTextoDelManifiesto(directorio, None),
        reloj=RelojFijo(),
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
    )


def montar(directorio_de_textos: Path = DIRECTORIO_DE_FIXTURES) -> Montaje:
    catalogo, almacen = CatalogoEnMemoria(), AlmacenDeChunksEnMemoria()
    embedder, sparse = EmbedderInterrumpible(), CodificadorSparseFalso()
    llm, nli = FakeMetadataLlm(), nli_de_metadatos()
    servicio = _servicio(catalogo, almacen, directorio_de_textos, embedder, sparse, llm, nli)
    observador = ObservadorEnMemoria(catalogo, almacen)
    return Montaje(
        catalogo,
        almacen,
        embedder,
        sparse,
        servicio,
        directorio_de_textos,
        observador,
        llm,
        nli,
    )


@pytest.fixture
def montaje() -> Montaje:
    return montar()


@pytest.fixture(params=["memoria", pytest.param("real", marks=pytest.mark.servicios_reales)])
def fabrica_de_montaje(request: pytest.FixtureRequest) -> Iterator[Callable[[Path], Montaje]]:
    """Fábrica de UN montaje por test, sobre memoria o sobre PostgreSQL y Milvus de test reales.

    El entorno real se pide solo si el parámetro es ``real``: la variante en memoria no necesita el Compose.
    """
    if request.param == "memoria":
        yield montar
        return
    base = request.getfixturevalue("base_migrada")
    cliente = request.getfixturevalue("cliente_milvus")
    ajustes = request.getfixturevalue("ajustes_milvus")
    motor = crear_motor(base.url_runtime)
    almacen = MilvusRepository(cliente, ajustes)
    almacen.ensure_collection()
    catalogo = CorpusDocumentRepository(motor)

    def montar_real(directorio: Path = DIRECTORIO_DE_FIXTURES) -> Montaje:
        embedder, sparse = EmbedderInterrumpible(), CodificadorSparseFalso()
        llm, nli = FakeMetadataLlm(), nli_de_metadatos()
        servicio = _servicio(catalogo, almacen, directorio, embedder, sparse, llm, nli)
        observador = ObservadorReal(motor, cliente, ajustes.milvus_collection_name)
        return Montaje(
            catalogo,
            almacen,
            embedder,
            sparse,
            servicio,
            directorio,
            observador,
            llm,
            nli,
        )

    yield montar_real
    with motor.begin() as conexion:
        for tabla in ("corpus_release_document", "corpus_release", "corpus_document"):
            conexion.execute(text(f"DELETE FROM corpus.{tabla}"))
    motor.dispose()


@pytest.fixture
def montaje_en_ambos(fabrica_de_montaje: Callable[[Path], Montaje]) -> Montaje:
    return fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
