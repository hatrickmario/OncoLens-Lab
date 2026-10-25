"""``python -m app.scripts.ingest`` contra PostgreSQL ``corpus`` y Milvus reales (US-117a, test después).

Se fingen solo los bordes: los modelos de embeddings (dense y sparse) y el reloj. El resto es el script real, la misma
raíz de composición que usa Compose. Perfil de test del Compose (``-m servicios_reales``).
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.engine import URL

from app.infrastructure.catalog.conexion import crear_motor
from app.scripts import ingest
from tests.support.fakes import RelojFijo
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B,
    MANIFIESTO_FX_06C_B_CON_FALLO,
    CodificadorSparseFalso,
)
from tests.support.metadatos import FakeMetadataLlm, nli_de_metadatos
from tests.support.milvus import INDICE_DE_ADR39
from tests.support.pg import BaseDeTest
from tests.support.semilla import EmbedderFalso

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def entorno_del_script(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    base_migrada: BaseDeTest,
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
) -> Iterator[BaseDeTest]:
    runtime = base_migrada.url_runtime
    sin_contrasena = URL.create(
        runtime.drivername,
        username=runtime.username,
        host=runtime.host,
        port=runtime.port,
        database=runtime.database,
        query=runtime.query,
    )
    for clave, valor in {
        "CORPUS_DATABASE_URL": sin_contrasena.render_as_string(hide_password=False),
        "MILVUS_URI": uri_de_milvus,
        "MILVUS_COLLECTION_NAME": nueva_coleccion(),
        "EMBEDDING_DIM": "8",
        "VECTOR_INDEX_TYPE": "HNSW",
        "VECTOR_INDEX_PARAMS": json.dumps(INDICE_DE_ADR39),
        "MILVUS_DENSE_METRIC_TYPE": "COSINE",
        "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
        "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
        "CORPUS_CUTOFF_DATE": "2026-10-16",
        "CORPUS_CHUNK_SIZE": "12",
        "CORPUS_CHUNK_OVERLAP": "0",
        "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
        "EMBEDDING_SPARSE_WEIGHTS_PATH": "/no-se-usa-con-fakes",
        "EMBEDDING_SPARSE_WEIGHTS_SHA256": "ab" * 32,
        "NLI_ENTAILMENT_THRESHOLD": "0.8",
        "CORPUS_METADATA_SAMPLE_DIR": str(tmp_path / "muestra"),
    }.items():
        monkeypatch.setenv(clave, valor)
    yield base_migrada
    motor = crear_motor(runtime)
    with motor.begin() as conexion:
        for tabla in ("corpus_release_document", "corpus_release", "corpus_document"):
            conexion.execute(text(f"DELETE FROM corpus.{tabla}"))
    motor.dispose()


def _ingerir(manifiesto, embedder=None, sparse=None) -> int:
    return ingest.main(
        ["--manifest", str(manifiesto)],
        embedder=embedder or EmbedderFalso(),
        sparse=sparse or CodificadorSparseFalso(),
        reloj=RelojFijo(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
    )


def test_el_script_ingiere_fx_06c_b_imprime_un_resumen_sin_contenido_y_sale_con_0_aunque_rechace(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = _ingerir(MANIFIESTO_FX_06C_B)

    capturado = capsys.readouterr()
    resumen = json.loads(capturado.out)
    assert codigo == 0, capturado.err
    assert resumen["resumen"] == {
        "embebido": 4,
        "omitido": 0,
        "rechazado_licencia": 2,
        "error": 0,
    }
    contrasena = entorno_del_script.url_runtime.password or ""
    assert "Resumen sintético" not in capturado.out + capturado.err
    assert contrasena not in capturado.out + capturado.err


def test_el_script_repetido_omite_lo_ya_embebido_sin_invocar_los_modelos(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    _ingerir(MANIFIESTO_FX_06C_B)
    capsys.readouterr()
    embedder, sparse = EmbedderFalso(), CodificadorSparseFalso()

    codigo = _ingerir(MANIFIESTO_FX_06C_B, embedder, sparse)

    resumen = json.loads(capsys.readouterr().out)
    assert codigo == 0 and resumen["release_id"] is None
    assert resumen["resumen"]["omitido"] == 4
    assert embedder.invocaciones == 0 and sparse.invocaciones == 0


def test_el_script_sale_con_1_si_un_documento_queda_en_error_pero_imprime_el_resumen(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = _ingerir(MANIFIESTO_FX_06C_B_CON_FALLO)

    resumen = json.loads(capsys.readouterr().out)
    assert codigo == 1
    assert resumen["resumen"] == {
        "embebido": 4,
        "omitido": 0,
        "rechazado_licencia": 2,
        "error": 1,
    }


def test_el_script_extrae_los_metadatos_de_i_lit_1_y_escribe_la_muestra_de_la_release(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    codigo = _ingerir(MANIFIESTO_FX_06C_B)

    resumen = json.loads(capsys.readouterr().out)
    motor = crear_motor(entorno_del_script.url_runtime)
    try:
        with motor.connect() as conexion:
            fila = conexion.execute(
                text(
                    "SELECT study_design, metadata_source, population_criteria->'biomarcadores' "
                    "FROM corpus.corpus_document WHERE starts_with(document_id, 'i-lit-1@')"
                )
            ).one()
    finally:
        motor.dispose()
    assert codigo == 0
    assert tuple(fila) == ("eca", "extraido_verificado", {"her2": "positivo"})
    assert resumen["metadatos_pendientes"]["cantidad"] == 0
    assert resumen["muestra_de_metadatos"]["tamano"] == 1
    assert (tmp_path / "muestra" / f"{resumen['release_id']}.yaml").is_file()
