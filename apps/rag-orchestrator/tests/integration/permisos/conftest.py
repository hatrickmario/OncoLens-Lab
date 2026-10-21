"""Base de test con schemas clínicos sintéticos para el aislamiento del rol ``rag_corpus`` (US-040)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from tests.integration.conftest import nuevo_sufijo
from tests.support.pg import BaseDeTest, ConfiguracionArnes, crear_base_de_test
from tests.support.schemas_clinicos import sembrar_schemas_clinicos_hostiles


@pytest.fixture(scope="module")
def base_con_schemas_clinicos(configuracion_arnes: ConfiguracionArnes) -> Iterator[BaseDeTest]:
    """Base migrada del corpus más los cinco schemas clínicos sintéticos."""
    base = crear_base_de_test(configuracion_arnes, nuevo_sufijo())
    try:
        sembrar_schemas_clinicos_hostiles(base.url_administracion)
    except Exception:
        base.destruir()
        raise
    yield base
    base.destruir()
