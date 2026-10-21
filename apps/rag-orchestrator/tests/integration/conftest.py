"""Fixtures del arnés de PostgreSQL real compartidas por los tests de integración (US-058, US-040).

Necesitan el PostgreSQL de test del Compose y correr dentro de ``corpus-db-net`` (ver ``tests/support/pg.py``).
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

from tests.support.ids import nuevo_sufijo
from tests.support.pg import (
    BaseDeTest,
    ConfiguracionArnes,
    crear_base_de_test,
    leer_configuracion_arnes,
)


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
