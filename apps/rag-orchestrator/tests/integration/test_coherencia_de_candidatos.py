"""RETRIEVAL_TOP_K y RERANKER_MAX_PAIRS con modelos locales (US-231a AC-5 y US-231b AC-9, decisión 82 de S1-plan).

``RETRIEVAL_TOP_K`` (candidatos de Milvus) puede superar ``RERANKER_MAX_PAIRS``: ya no es un error de arranque, porque el
servicio recorta por puntaje de recuperación antes de reranquear. Los reranker real y falso siguen lanzando el error del
puerto si reciben más pares que su máximo (LSP), pero el servicio nunca los supera.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.ports import ChunkEncontrado, FalloDeInferencia
from app.bootstrap import PuertosDelCorpus, crear_app
from app.config.settings import Settings
from app.infrastructure.models.local import cargar_modelos_locales
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.inferencia_falsa import TokenizadorFalso
from tests.support.modelos import (
    arrancar_en_subproceso,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    fabricar_sesion_falsa,
    salida_completa,
    settings_de_modelos,
)
from tests.support.recuperacion import (
    EJEMPLOS,
    Q_HER2,
    BuscadorFalso,
    CatalogoFalso,
    ChunkFx,
    LectorReleaseFalso,
    RerankerFalso,
    solicitud_de,
)
from tests.support.service_jwt import con_token_valido


def test_arranque_con_candidatos_dentro_del_maximo_de_pares_no_se_niega_por_esa_causa(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = entorno_de_arranque(modelos, RETRIEVAL_TOP_K="12", RERANKER_MAX_PAIRS="12")

    salida = salida_completa(arrancar_en_subproceso(entorno))

    assert "RERANKER_MAX_PAIRS" not in salida


def test_mas_candidatos_que_pares_no_impide_cargar_los_modelos_locales(tmp_path: Path) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    cargados = cargar_modelos_locales(
        settings_de_modelos(modelos, retrieval_top_k=30),
        fabricar_sesion=fabricar_sesion_falsa(1024),
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert cargados.reranker is not None


@pytest.mark.ac("US-231b", 9)
def test_con_modelos_locales_30_candidatos_y_12_pares_el_reranker_real_responde_sin_503_porque_el_servicio_recorta(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    modelos.variables["EMBEDDING_DIM"] = "8"
    candidatos = [
        ChunkFx(
            f"c-{i:02d}",
            f"doc-c-{i:02d}",
            f"texto sintético {i}",
            [1.0 - 0.01 * i, 0, 0, 0, 0, 0, 0, 0],
            True,
            "mama",
        )
        for i in range(30)
    ]
    ajustes: Settings = settings_de_modelos(
        modelos,
        llm_provider="local",
        service_jwt_public_key_file=settings_de_prueba().service_jwt_public_key_file,
        relevance_threshold=0.99,
        retrieval_top_k=30,
        rerank_top_n=10,
        nli_model="nli-test@1",
        prompt_version="rag-query@test",
        fake_responses_path=EJEMPLOS,
    )
    app = crear_app(
        ajustes,
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        corpus=PuertosDelCorpus(BuscadorFalso(candidatos), LectorReleaseFalso(), CatalogoFalso()),
        cargador_de_modelos=lambda s: cargar_modelos_locales(
            s,
            fabricar_sesion=fabricar_sesion_falsa(8),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        ),
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec("#/components/schemas/RagQueryInternalResponse", respuesta.json())
    assert respuesta.json()["retrievalStats"]["retrieved"] == 30


def test_el_reranker_falso_lanza_el_error_del_puerto_con_mas_pares_que_su_maximo() -> None:
    candidatos = [
        ChunkEncontrado(chunk_id=f"c{i}", document_id="d", chunk_text="t", similitud_dense=0.1)
        for i in range(3)
    ]

    with pytest.raises(FalloDeInferencia):
        RerankerFalso(max_pairs=2).puntuar(Q_HER2, candidatos)

    assert len(RerankerFalso(max_pairs=3).puntuar(Q_HER2, candidatos)) == 3
