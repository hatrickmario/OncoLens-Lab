"""``python -m app.scripts.load_seed_corpus`` contra PostgreSQL ``corpus`` y Milvus reales (US-059, test después).

Se fingen solo los bordes: el modelo de embeddings (el adapter real es de L1D-106) y el reloj. El resto es el
script real, la misma raíz de composición que usa Compose.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator

import pytest
from sqlalchemy import text
from sqlalchemy.engine import URL

from app.infrastructure.catalog.conexion import crear_motor
from app.scripts import load_seed_corpus
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import RelojFijo
from tests.support.milvus import INDICE_DE_ADR39
from tests.support.pg import BaseDeTest
from tests.support.semilla import MANIFIESTO_FX_06C_A, EmbedderFalso

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def entorno_del_script(
    monkeypatch: pytest.MonkeyPatch,
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
        "CORPUS_SEED_MANIFEST_PATH": str(MANIFIESTO_FX_06C_A),
        "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
        "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
        "CORPUS_CUTOFF_DATE": "2026-10-16",
        "CORPUS_CHUNK_SIZE": "12",
        "CORPUS_CHUNK_OVERLAP": "0",
    }.items():
        monkeypatch.setenv(clave, valor)
    yield base_migrada
    motor = crear_motor(runtime)
    with motor.begin() as conexion:
        for tabla in ("corpus_release_document", "corpus_release", "corpus_document"):
            conexion.execute(text(f"DELETE FROM corpus.{tabla}"))
    motor.dispose()


def test_el_script_carga_la_semilla_imprime_un_reporte_sin_contenido_y_sale_con_0_aunque_rechace(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = load_seed_corpus.main(embedder=EmbedderFalso(), reloj=RelojFijo())

    capturado = capsys.readouterr()
    reporte = json.loads(capturado.out)
    assert codigo == 0, capturado.err
    assert reporte["resumen"] == {
        "cargado": 2,
        "nueva_version": 1,
        "omitido": 0,
        "rechazado": 3,
        "error": 0,
    }
    assert reporte["release_id"].startswith("release-")
    contrasena_runtime = entorno_del_script.url_runtime.password or ""
    assert "Texto sintético" not in capturado.out + capturado.err
    assert "cancer.gov" not in capturado.out + capturado.err
    assert contrasena_runtime not in capturado.out + capturado.err


def test_el_script_carga_el_manifiesto_real_con_embeddings_falsos_y_los_limites_de_milvus(
    entorno_del_script: BaseDeTest,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """NO es el smoke de AC-1 (modelo real, L1D-106): comprueba que los textos reales caben en el esquema de Milvus."""
    monkeypatch.setenv(
        "CORPUS_SEED_MANIFEST_PATH", str(RAIZ_REPOSITORIO / "data/raw/seed/manifest.yaml")
    )
    monkeypatch.setenv("CORPUS_CHUNK_SIZE", "1024")

    codigo = load_seed_corpus.main(embedder=EmbedderFalso(), reloj=RelojFijo())

    capturado = capsys.readouterr()
    reporte = json.loads(capturado.out)
    assert codigo == 0, capturado.err
    assert reporte["resumen"]["cargado"] == 10 and reporte["resumen"]["error"] == 0
    assert sum(d["chunks"] for d in reporte["documentos"]) > 100


def test_el_script_repetido_omite_lo_ya_cargado_y_no_publica_otra_release(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    embedder = EmbedderFalso()
    load_seed_corpus.main(embedder=embedder, reloj=RelojFijo())
    capsys.readouterr()
    embeber_antes = embedder.invocaciones

    codigo = load_seed_corpus.main(embedder=embedder, reloj=RelojFijo())

    reporte = json.loads(capsys.readouterr().out)
    assert codigo == 0 and reporte["release_id"] is None
    assert reporte["resumen"]["omitido"] == 3  # t-ok-1 y t-ok-2 (ya embebidos) y t-ok-1-v2
    assert embedder.invocaciones == embeber_antes


def test_el_script_sale_con_1_si_un_documento_queda_en_error_pero_imprime_el_reporte(
    entorno_del_script: BaseDeTest, capsys: pytest.CaptureFixture[str]
) -> None:
    embedder = EmbedderFalso()
    embedder.error = ConnectionError("modelo no disponible")

    codigo = load_seed_corpus.main(embedder=embedder, reloj=RelojFijo())

    reporte = json.loads(capsys.readouterr().out)
    assert codigo == 1
    assert reporte["resumen"]["error"] == 3 and reporte["resumen"]["rechazado"] == 3
