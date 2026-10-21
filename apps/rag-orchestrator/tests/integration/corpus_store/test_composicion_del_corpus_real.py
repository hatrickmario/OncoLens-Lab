"""``crear_puertos_del_corpus`` contra PostgreSQL ``corpus`` y Milvus reales (US-231b AC-9, test después).

Corre dentro de ``corpus-db-net`` con el perfil ``test`` del Compose (``-m servicios_reales``); no corre en la ruta
rápida de la CI. La composición, el rol ``rag_corpus`` y la sonda son los reales: no se finge ningún borde.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from pymilvus import MilvusClient
from sqlalchemy.engine import URL, Engine

from app.config.settings import CorpusDatabaseSettings
from app.infrastructure.corpus.composicion import CorpusNoDisponibleError, crear_puertos_del_corpus
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.milvus import ajustes_de_milvus
from tests.support.pg import BaseDeTest

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
        )

    assert error.value.variable == "MILVUS_COLLECTION_NAME"
    assert uri_de_milvus not in f"{error.value} {error.value!r}"
