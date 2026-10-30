"""``crear_puertos_del_corpus`` contra PostgreSQL ``corpus`` y Milvus reales (US-231b AC-9, test después).

Corre dentro de ``corpus-db-net`` con el perfil ``test`` del Compose (``-m servicios_reales``); no corre en la ruta
rápida de la CI. La composición, el rol ``rag_corpus`` y la sonda son los reales: no se finge ningún borde.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from pymilvus import MilvusClient
from sqlalchemy import text
from sqlalchemy.engine import URL, Engine

from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL as MAX_VALORES
from app.config.settings import CorpusDatabaseSettings, Settings
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.corpus.composicion import CorpusNoDisponibleError, crear_puertos_del_corpus
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.milvus import ajustes_de_milvus
from tests.support.pg import BaseDeTest
from tests.support.poblacion_lista import valor_nuevo
from tests.support.registros import registro_de_prueba

pytestmark = pytest.mark.servicios_reales


def _ajustes_del_catalogo(base: BaseDeTest, directorio: Path) -> CorpusDatabaseSettings:
    runtime = base.url_runtime
    secreto = directorio / "pg_rag_corpus_password"
    secreto.write_text(runtime.password or "")
    sin_contrasena = URL.create(
        runtime.drivername,
        username=runtime.username,
        host=runtime.host,
        port=runtime.port,
        database=runtime.database,
        query=runtime.query,
    )
    return CorpusDatabaseSettings(  # type: ignore[call-arg]
        _env_file=None,
        corpus_database_url=sin_contrasena.render_as_string(hide_password=False),
        pg_rag_corpus_password_file=secreto,
    )


@pytest.mark.ac("US-231b", 9)
def test_con_milvus_y_catalogo_reales_compone_los_puertos_y_el_catalogo_vacio_no_devuelve_fichas(
    base_migrada: BaseDeTest,
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
    fabricar_motor_cerrable: Callable[[URL], Engine],
    tmp_path: Path,
) -> None:
    milvus = ajustes_de_milvus(uri_de_milvus, nueva_coleccion())
    MilvusRepository(MilvusClient(uri=uri_de_milvus), milvus).ensure_collection()

    puertos = crear_puertos_del_corpus(
        milvus,
        _ajustes_del_catalogo(base_migrada, tmp_path),
        fabricar_motor=fabricar_motor_cerrable,
        max_valores_de_poblacion=MAX_VALORES,
    )

    assert puertos.catalogo.fichas_por_documento(["no-existe"]) == {}
    assert puertos.buscador.search_dense([0.0] * milvus.embedding_dim, 3) == []


@pytest.mark.ac("US-231b", 9)
def test_con_una_coleccion_inexistente_termina_nombrando_milvus_collection_name(
    base_migrada: BaseDeTest,
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
    tmp_path: Path,
) -> None:
    milvus = ajustes_de_milvus(uri_de_milvus, nueva_coleccion())  # nadie la creó

    with pytest.raises(CorpusNoDisponibleError) as error:
        crear_puertos_del_corpus(
            milvus,
            _ajustes_del_catalogo(base_migrada, tmp_path),
            max_valores_de_poblacion=MAX_VALORES,
        )

    assert error.value.variable == "MILVUS_COLLECTION_NAME"
    assert uri_de_milvus not in f"{error.value} {error.value!r}"


def test_el_tope_de_valores_de_poblacion_sale_de_la_configuracion_cuando_se_compone_el_catalogo(
    base_migrada: BaseDeTest,
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
    fabricar_motor_cerrable: Callable[[URL], Engine],
    tmp_path: Path,
) -> None:
    milvus = ajustes_de_milvus(uri_de_milvus, nueva_coleccion())
    MilvusRepository(MilvusClient(uri=uri_de_milvus), milvus).ensure_collection()
    motor = fabricar_motor_cerrable(base_migrada.url_runtime)
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba(
            "doc-tope@abcdef",
            population_criteria={"ecog": [valor_nuevo("0-1", "ch-1"), valor_nuevo("2", "ch-1")]},
            metadata_source="extraido_verificado",
            checksum="e" * 64,
            version_group_id="doc-tope",
        )
    )
    ajustes = Settings(_env_file=None, population_max_values_per_criterion=1)  # type: ignore[call-arg]

    puertos = crear_puertos_del_corpus(
        milvus,
        _ajustes_del_catalogo(base_migrada, tmp_path),
        fabricar_motor=fabricar_motor_cerrable,
        max_valores_de_poblacion=ajustes.population_max_values_per_criterion,
    )

    criterio = puertos.catalogo.poblacion_por_documento({"doc-tope@abcdef"})[
        "doc-tope@abcdef"
    ].criterios["ecog"]
    assert criterio.valores == ()
    assert criterio.invalidez is not None
    assert criterio.invalidez.motivo == "demasiados_valores"
    with motor.begin() as conexion:  # la base es de módulo: no deja la fila a los demás tests
        conexion.execute(text("DELETE FROM corpus.corpus_document"))
