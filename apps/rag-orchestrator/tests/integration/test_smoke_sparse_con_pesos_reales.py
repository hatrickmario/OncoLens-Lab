"""Smoke del ``CodificadorSparseBgeM3`` con los pesos REALES de ADR-39 (US-117b tarea 0.4, ex 1.10 de L1D-116).

NO corre en la CI ni en el job ``integration-rag``: la CI no tiene pesos (RN-14, ``-m "not models"`` por defecto). Se pide en la VM
local con las variables de ADR-39 (``EMBEDDING_MODEL_PATH``/``_SHA256``, ``EMBEDDING_TOKENIZER_*``, ``EMBEDDING_SPARSE_WEIGHTS_*``):

    pytest -m models tests/integration/test_smoke_sparse_con_pesos_reales.py

Comprueba que el adapter real devuelve al menos un término con peso por pasaje (lo que Milvus exige) y que el mismo pasaje da el
mismo vector (determinismo). Solo textos sintéticos (FX-06a-c).
"""

from __future__ import annotations

import pytest

from app.config.settings import AjustesSparse
from app.infrastructure.models.local import cargar_embeddings_y_sparse_de_pasajes
from app.scripts.load_seed_corpus import ajustes_de_modelos_del_entorno
from tests.support.inferencia_falsa import PASAJES_FX06AC

pytestmark = pytest.mark.models


def test_el_sparse_real_devuelve_al_menos_un_termino_con_peso_por_pasaje_y_es_determinista() -> (
    None
):
    _, sparse = cargar_embeddings_y_sparse_de_pasajes(
        ajustes_de_modelos_del_entorno(),
        AjustesSparse(_env_file=None),  # type: ignore[call-arg]
    )
    pasajes = list(PASAJES_FX06AC.values())

    mapas = sparse.codificar(pasajes)

    assert len(mapas) == len(pasajes)
    assert all(len(mapa) >= 1 and all(peso > 0 for peso in mapa.values()) for mapa in mapas)
    assert sparse.codificar(pasajes) == mapas
