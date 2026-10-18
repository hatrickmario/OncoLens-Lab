"""Smoke de la semilla con embeddings reales y la recuperación compuesta por ``main.py`` (US-231b AC-9, L1D-115 tarea 1.13).

NO corre en la CI ni en la ruta rápida: necesita el Compose de L1D-164 (PostgreSQL ``corpus`` y Milvus reales, dentro de
``corpus-db-net``), los pesos de ``MODEL_HOST_DIR`` y el manifiesto real. Se pide con ``-m "models and servicios_reales"``:

    pytest -m "models and servicios_reales" tests/integration/test_smoke_semilla_con_modelos_reales.py

Solo corpus público con licencia registrada (RN-21) y ningún dato de pacientes (RN-13). El entorno del proceso es el del
servicio ``rag-orchestrator`` del Compose (``MODEL_PROVIDER=local``, ``LLM_PROVIDER=local``); los asserts sobre
``/rag/query`` son los de la opción (a): ``200 sin_evidencia`` o ``503 LOCAL_LLM_UNAVAILABLE``, nunca ``503
RETRIEVAL_UNAVAILABLE`` (composición o recuperación rotas). El tope de 12 pares no se prueba aquí: lo cubre el log de la
etapa de corte y la integración de la tarea 1.9.
"""

from __future__ import annotations

import importlib
import json
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from pymilvus import MilvusClient

from app.config.settings import CorpusDatabaseSettings, CorpusSeedSettings, MilvusSettings
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.scripts import load_seed_corpus
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec
from tests.support.fakes import par_de_sesion, settings_de_prueba
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.service_jwt import con_token_valido

pytestmark = [pytest.mark.models, pytest.mark.servicios_reales]

MANIFIESTO_REAL = RAIZ_REPOSITORIO / "data" / "raw" / "seed" / "manifest.yaml"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


@pytest.fixture
def entorno_del_servicio(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORPUS_SEED_MANIFEST_PATH", str(MANIFIESTO_REAL))
    monkeypatch.setenv("MODEL_PROVIDER", "local")
    monkeypatch.setenv("LLM_PROVIDER", "local")
    monkeypatch.setenv(
        "SERVICE_JWT_PUBLIC_KEY_FILE", str(settings_de_prueba().service_jwt_public_key_file)
    )


@pytest.mark.ac("US-059", 1)
@pytest.mark.ac("US-231b", 9)
def test_la_semilla_real_queda_embebida_y_vigente_con_los_metadatos_del_catalogo_y_la_release_publicada(
    entorno_del_servicio: None, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = load_seed_corpus.main()

    reporte = json.loads(capsys.readouterr().out)
    assert codigo == 0, reporte.get("resumen")
    base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
    motor = crear_motor(
        componer_url(
            base.corpus_database_url,
            base.pg_rag_corpus_password_file,
            "PG_RAG_CORPUS_PASSWORD_FILE",
        )
    )
    try:
        with motor.connect() as conexion:
            estados = conexion.execute(
                text("SELECT DISTINCT status, is_current FROM corpus.corpus_document")
            ).all()
            catalogo = {
                fila.document_id: (fila.source_type, fila.language, fila.cancer_type_tags)
                for fila in conexion.execute(
                    text(
                        "SELECT document_id, source_type, language, cancer_type_tags "
                        "FROM corpus.corpus_document WHERE is_current"
                    )
                )
            }
            fuentes = conexion.execute(
                text(
                    "SELECT excluded_sources FROM corpus.corpus_release "
                    "ORDER BY published_at DESC LIMIT 1"
                )
            ).scalar_one()
    finally:
        motor.dispose()
    assert {(s, v) for s, v in estados} == {("embebido", True)}
    assert sorted(x.strip() for x in fuentes.split(",")) == ["ESMO", "NCCN"]
    milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
    chunks = MilvusClient(uri=milvus.milvus_uri).query(
        milvus.milvus_collection_name,
        filter="is_current == true",
        output_fields=["document_id", "source_type", "language", "cancer_type_tags"],
        limit=16384,
    )
    assert chunks and {c["document_id"] for c in chunks} <= set(catalogo)
    assert all(
        (c["source_type"], c["language"], c["cancer_type_tags"]) == catalogo[c["document_id"]]
        for c in chunks
    )
    assert CorpusSeedSettings(_env_file=None).corpus_excluded_sources == ("NCCN", "ESMO")  # type: ignore[call-arg]


@pytest.mark.ac("US-231b", 9)
def test_rag_query_q_her2_compone_y_recupera_con_200_sin_evidencia_o_503_llm_local_y_nunca_503_de_recuperacion(
    entorno_del_servicio: None,
) -> None:
    sys.modules.pop(
        "app.main", None
    )  # import fresco: compone el corpus real con el entorno del servicio
    servicio = importlib.import_module("app.main")
    cliente = TestClient(
        servicio.app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code in (200, 503), respuesta.text
    if respuesta.status_code == 200:
        assert_matches_spec(RESPUESTA, respuesta.json())
        assert respuesta.json()["status"] == "sin_evidencia"
    else:
        assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
