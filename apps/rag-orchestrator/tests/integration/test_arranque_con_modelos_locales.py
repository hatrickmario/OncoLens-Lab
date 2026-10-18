"""Cableado de los adapters reales en la composición (US-231a, tarea 1.15): ambos modos de ``MODEL_PROVIDER``.

Los pesos son archivos sintéticos verificados de verdad; solo la sesión y el tokenizer son dobles (RN-14).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import PuertosDelCorpus, crear_app
from app.config.settings import Settings
from app.domain.modelos import describir_modelo
from app.infrastructure.models.local import ModelosDeRecuperacion, cargar_modelos_locales
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion
from tests.support.inferencia_falsa import (
    SesionDeEmbeddingsFalsa,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
)
from tests.support.modelos import (
    EntornoDeModelos,
    crear_entorno_de_modelos,
    settings_de_modelos,
)
from tests.support.recuperacion import (
    EJEMPLOS,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
    LectorReleaseFalso,
    solicitud_de,
)
from tests.support.service_jwt import con_token_valido

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"


@pytest.fixture
def modelos(tmp_path: Path) -> EntornoDeModelos:
    return crear_entorno_de_modelos(tmp_path / "modelos")


def _cargador_con_dobles(
    registro: list[Settings],
) -> Callable[[Settings], ModelosDeRecuperacion]:
    def cargar(settings: Settings) -> ModelosDeRecuperacion:
        registro.append(settings)
        return cargar_modelos_locales(
            settings,
            fabricar_sesion=lambda ruta, **_: (
                SesionDeEmbeddingsFalsa(8) if "embedding" in ruta.name else SesionDeLogitsFalsa()
            ),
            fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
        )

    return cargar


def _ajustes(modelos: EntornoDeModelos, **cambios: object) -> Settings:
    base: dict[str, object] = {
        "service_jwt_public_key_file": _ruta_publica(),
        "relevance_threshold": 0.30,
        "retrieval_top_k": 30,
        "rerank_top_n": 10,
        "nli_model": "nli-test@1",
        "prompt_version": "rag-query@test",
        "fake_responses_path": EJEMPLOS,
        **cambios,
    }
    return settings_de_modelos(modelos, **base)


def _ruta_publica() -> Path:
    from tests.support.fakes import settings_de_prueba

    return Path(str(settings_de_prueba().service_jwt_public_key_file))


def _cliente(app) -> TestClient:
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def _app(ajustes: Settings, **componentes: object):
    return crear_app(ajustes, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), **componentes)  # type: ignore[arg-type]


def test_con_modelos_locales_y_corpus_rag_query_recupera_con_los_adapters_reales_y_declara_su_procedencia(
    modelos: EntornoDeModelos,
) -> None:
    registro: list[Settings] = []
    modelos.variables["EMBEDDING_DIM"] = (
        "8"  # la dimensión de los vectores de FX-06a-a (EMBEDDING_DIM=8 en los tests)
    )
    app = _app(
        _ajustes(modelos, llm_provider="local"),
        corpus=PuertosDelCorpus(BuscadorFalso(), LectorReleaseFalso()),
        cargador_de_modelos=_cargador_con_dobles(registro),
    )

    respuesta = _cliente(app).post("/rag/query", json=solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    meta = respuesta.json()["meta"]
    assert meta["rerankerModel"] == describir_modelo(
        "BAAI/bge-reranker-v2-m3", "rev-reranker-test", modelos.variables["RERANKER_MODEL_SHA256"]
    )
    assert meta["embeddingModel"].startswith("BAAI/bge-m3@rev-embeddings-test#sha256:")
    assert len(registro) == 1


def test_con_modelos_locales_pero_sin_corpus_rag_query_responde_503_fallando_cerrado(
    modelos: EntornoDeModelos,
) -> None:
    app = _app(
        _ajustes(modelos, llm_provider="local"), cargador_de_modelos=_cargador_con_dobles([])
    )

    respuesta = _cliente(app).post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert_matches_spec(RESPUESTA_503, respuesta.json())
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"


def test_con_llm_fake_y_modelos_locales_arranca_verifica_los_modelos_y_responde_con_los_ejemplos(
    modelos: EntornoDeModelos,
) -> None:
    registro: list[Settings] = []
    app = _app(
        _ajustes(modelos, llm_provider="fake"), cargador_de_modelos=_cargador_con_dobles(registro)
    )

    respuesta = _cliente(app).post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert len(registro) == 1


def test_con_modelos_fake_no_se_invoca_el_cargador_de_modelos(modelos: EntornoDeModelos) -> None:
    registro: list[Settings] = []

    _app(
        _ajustes(modelos, llm_provider="fake", model_provider="fake"),
        cargador_de_modelos=_cargador_con_dobles(registro),
    )

    assert registro == []


def test_un_modelo_alterado_impide_construir_la_app_nombrando_la_variable(
    modelos: EntornoDeModelos,
) -> None:
    modelos.ruta_de("EMBEDDING_MODEL_PATH").write_bytes(b"alterado")

    with pytest.raises(ModeloNoVerificadoError) as error:
        _app(_ajustes(modelos, llm_provider="fake"), cargador_de_modelos=_cargador_con_dobles([]))

    assert error.value.variable == "EMBEDDING_MODEL_SHA256"
