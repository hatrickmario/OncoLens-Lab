"""Fixtures de integración del catálogo y la colección del corpus (US-058).

Necesitan el PostgreSQL de test y el Milvus de test del Compose, y correr dentro de ``corpus-db-net`` (ver
``tests/support/pg.py``). Si falta una variable el test FALLA nombrándola: nunca se salta.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable, Iterator

import pytest
from pymilvus import MilvusClient

from tests.support.milvus import (
    ajustes_de_milvus,
    eliminar_coleccion_de_test,
    nombre_de_coleccion_de_test,
)
from tests.support.pg import (
    BaseDeTest,
    ConfiguracionArnes,
    ErrorArnes,
    crear_base_de_test,
    leer_configuracion_arnes,
)


def nuevo_sufijo() -> str:
    """Generador de ids del arnés (borde de los tests): 10 caracteres hexadecimales."""
    return uuid.uuid4().hex[:10]


@pytest.fixture(scope="session")
def configuracion_arnes() -> ConfiguracionArnes:
    return leer_configuracion_arnes(os.environ)


@pytest.fixture
def base_con_schema_vacio(configuracion_arnes: ConfiguracionArnes) -> Iterator[BaseDeTest]:
    """Base de test con el schema ``corpus`` vacío y sus privilegios, SIN migrar."""
    base = crear_base_de_test(configuracion_arnes, nuevo_sufijo(), migrar_catalogo=False)
    yield base
    base.destruir()


@pytest.fixture(scope="module")
def base_migrada(configuracion_arnes: ConfiguracionArnes) -> Iterator[BaseDeTest]:
    """Base de test migrada con Alembic como ``rag_corpus_migrator``. Los tests que escriben revierten."""
    base = crear_base_de_test(configuracion_arnes, nuevo_sufijo())
    yield base
    base.destruir()


@pytest.fixture(scope="session")
def uri_de_milvus() -> str:
    uri = os.environ.get("MILVUS_URI")
    if not uri:
        raise ErrorArnes("falta la variable MILVUS_URI (Milvus de test del Compose)")
    return uri


@pytest.fixture(scope="session")
def cliente_milvus(uri_de_milvus: str) -> MilvusClient:
    return MilvusClient(uri=uri_de_milvus)


@pytest.fixture
def nueva_coleccion(cliente_milvus: MilvusClient) -> Iterator[Callable[[], str]]:
    """Entrega nombres de colección de test únicos y elimina al terminar las que el test creó."""
    creadas: list[str] = []

    def nueva() -> str:
        nombre = nombre_de_coleccion_de_test(nuevo_sufijo())
        creadas.append(nombre)
        return nombre

    yield nueva
    for nombre in creadas:
        eliminar_coleccion_de_test(cliente_milvus, nombre)


@pytest.fixture
def ajustes_milvus(uri_de_milvus: str, nueva_coleccion: Callable[[], str]):  # noqa: ANN201
    return ajustes_de_milvus(uri_de_milvus, nueva_coleccion())
