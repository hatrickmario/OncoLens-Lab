"""``python -m app.scripts.ingest`` sin servicios (US-117a D5): configuración, modelos reales y manifiesto inválido."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.scripts import ingest
from tests.support.ingesta import MANIFIESTO_FX_06C_B, CodificadorSparseFalso
from tests.support.metadatos import FakeMetadataLlm, nli_de_metadatos
from tests.support.semilla import EmbedderFalso

RAIZ_APP = Path(__file__).resolve().parents[2]
ENTORNO_VALIDO = {
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
    "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
    "CORPUS_CUTOFF_DATE": "2026-10-16",
    "CORPUS_CHUNK_SIZE": "12",
    "CORPUS_CHUNK_OVERLAP": "0",
    "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
    "EMBEDDING_SPARSE_WEIGHTS_PATH": "/models/no-existe/sparse_linear.npz",
    "EMBEDDING_SPARSE_WEIGHTS_SHA256": "ab" * 32,
    "MILVUS_URI": "http://milvus.invalid:19530",
    "EMBEDDING_DIM": "8",
    "VECTOR_INDEX_TYPE": "HNSW",
    "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200, "ef": 64}',
    "MILVUS_DENSE_METRIC_TYPE": "COSINE",
    "CORPUS_DATABASE_URL": "postgresql+psycopg://rag_corpus@postgres.invalid:5432/oncolens?sslmode=require",
    "PG_RAG_CORPUS_PASSWORD_FILE": "/run/secrets/no-existe",
    "NLI_ENTAILMENT_THRESHOLD": "0.8",
}
ARGUMENTOS = ["--manifest", str(MANIFIESTO_FX_06C_B)]


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for clave in ("MODEL_PROVIDER", "ALLOW_CC_BY_NC"):
        monkeypatch.delenv(clave, raising=False)
    for clave, valor in ENTORNO_VALIDO.items():
        monkeypatch.setenv(clave, valor)
    return monkeypatch


@pytest.mark.parametrize(
    "clave", ["CORPUS_CUTOFF_DATE", "SPARSE_VECTOR_SOURCE", "EMBEDDING_SPARSE_WEIGHTS_SHA256"]
)
def test_una_clave_obligatoria_ausente_sale_con_1_nombrandola_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], clave: str
) -> None:
    entorno.delenv(clave)

    codigo = ingest.main(ARGUMENTOS, embedder=EmbedderFalso(), sparse=CodificadorSparseFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and clave in capturado.err and capturado.out == ""


def test_un_origen_de_sparse_distinto_de_modelo_embeddings_sale_con_1_nombrando_la_clave(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("SPARSE_VECTOR_SOURCE", "bm25")

    codigo = ingest.main(ARGUMENTOS, embedder=EmbedderFalso(), sparse=CodificadorSparseFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and "SPARSE_VECTOR_SOURCE" in capturado.err and "bm25" not in capturado.err


def test_sin_model_provider_local_sale_con_1_nombrando_la_variable_y_nunca_usa_un_doble(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = ingest.main(ARGUMENTOS)

    capturado = capsys.readouterr()
    assert codigo == 1 and "MODEL_PROVIDER" in capturado.err and capturado.out == ""


def test_un_manifiesto_inexistente_sale_con_1_sin_la_ruta_en_el_mensaje(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = ingest.main(
        ["--manifest", "/no/existe/manifest.yaml"],
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and "/no/existe" not in capturado.err and capturado.out == ""


def test_una_base_inalcanzable_sale_con_1_con_la_clase_del_error_y_sin_la_uri(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = ingest.main(
        ARGUMENTOS,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and capturado.err.startswith("ingest: falló (")
    assert "postgres.invalid" not in capturado.err and "milvus.invalid" not in capturado.err


def test_el_proceso_real_sin_modelos_termina_con_codigo_1_dentro_del_plazo_y_sin_salida_estandar(
    entorno: pytest.MonkeyPatch,
) -> None:
    """Humo del proceso real (``python -m``): código de salida y salida estándar, con plazo explícito de 120 s."""
    proceso = subprocess.run(
        [sys.executable, "-m", "app.scripts.ingest", *ARGUMENTOS],
        cwd=RAIZ_APP,
        env={**os.environ, **ENTORNO_VALIDO, "PYTHONPATH": str(RAIZ_APP)},
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert proceso.returncode == 1
    assert "MODEL_PROVIDER" in proceso.stderr and proceso.stdout == ""


def test_sin_umbral_del_nli_sale_con_1_nombrando_la_variable_y_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.delenv("NLI_ENTAILMENT_THRESHOLD")

    codigo = ingest.main(
        ARGUMENTOS,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and "NLI_ENTAILMENT_THRESHOLD" in capturado.err and capturado.out == ""
    assert "postgres.invalid" not in capturado.err


def test_las_claves_de_la_muestra_tienen_valores_por_defecto_en_la_configuracion(
    entorno: pytest.MonkeyPatch,
) -> None:
    from app.config.settings import CorpusIngestSettings

    ajustes = CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.corpus_metadata_sample_pct == 10.0
    assert ajustes.corpus_metadata_sample_seed
    assert ajustes.corpus_metadata_sample_dir == Path("data/evaluation/corpus-metadatos")


@pytest.mark.parametrize("pct", ["-1", "100.5"])
def test_un_porcentaje_de_muestra_fuera_de_rango_sale_con_1_nombrando_la_clave(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], pct: str
) -> None:
    entorno.setenv("CORPUS_METADATA_SAMPLE_PCT", pct)

    codigo = ingest.main(ARGUMENTOS, embedder=EmbedderFalso(), sparse=CodificadorSparseFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and "CORPUS_METADATA_SAMPLE_PCT" in capturado.err


class _EscritorQueFalla:
    def escribir(self, release_id, contenido):  # type: ignore[no-untyped-def]
        raise OSError("disco lleno: /ruta/secreta")


def test_un_error_al_escribir_la_muestra_va_al_resumen_con_su_clase_y_no_tumba_la_ingesta() -> None:
    from app.application.corpus_ingestion.reporte import (
        Estado,
        ReporteDeIngesta,
        ResultadoDeIngesta,
    )
    from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
    from app.domain.corpus_metadata.resultado import CampoDeMetadato, MetadatosResueltos
    from tests.support.fakes import RelojFijo
    from tests.support.metadatos import lote_sintetico

    metadatos = MetadatosResueltos(
        "otro", None, None, None, {}, "extraido_verificado", (CampoDeMetadato("trial_phase", "II"),)
    )
    reporte = ReporteDeIngesta(
        (
            ResultadoDeIngesta(
                "lote-01", Estado.EMBEBIDO, metadatos=metadatos, document_id="lote-01@x"
            ),
        ),
        "release-1",
    )
    generador = GeneradorDeMuestraDeMetadatos(
        pct=100,
        semilla="s",
        escritor=_EscritorQueFalla(),
        reloj=RelojFijo(),
        prompt_version="p",
        llm_model="l",
        nli_model="n",
    )

    resumen = ingest.escribir_muestra(generador, reporte, lote_sintetico(1))

    assert resumen == {"tamano": 0, "fallo": "OSError"}
    assert "secreta" not in str(resumen)


@pytest.mark.parametrize(
    ("variable", "valor"), [("LLM_CLOUD_ENABLED", "true"), ("LLM_PROVIDER", "fake")]
)
def test_la_cli_se_niega_sin_llm_local_nombrando_solo_la_variable_y_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], variable: str, valor: str
) -> None:
    """Decidido (usuario, 2026-10-24), RN-12: la extracción de metadatos solo usa el LLM local."""
    entorno.setenv(variable, valor)

    codigo = ingest.main(
        ARGUMENTOS,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and variable in capturado.err and capturado.out == ""
    assert valor not in capturado.err and "postgres.invalid" not in capturado.err


def _temperatura_del_cliente(entorno: pytest.MonkeyPatch, **variables: str) -> float:
    from app.config.settings import Settings

    for clave, valor in variables.items():
        entorno.setenv(clave, valor)
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    return ingest._llm_local(ambiente)._temperature


def test_la_extraccion_de_metadatos_usa_su_propia_temperatura_y_no_la_de_generacion(
    entorno: pytest.MonkeyPatch,
) -> None:
    assert _temperatura_del_cliente(entorno, LLM_TEMPERATURE="0.7") == 0.0


def test_la_temperatura_de_extraccion_se_configura_con_corpus_metadata_llm_temperature(
    entorno: pytest.MonkeyPatch,
) -> None:
    temperatura = _temperatura_del_cliente(
        entorno, LLM_TEMPERATURE="0.7", CORPUS_METADATA_LLM_TEMPERATURE="0.3"
    )

    assert temperatura == 0.3


@pytest.mark.parametrize("valor", ["-0.1", "2.5"])
def test_una_temperatura_de_extraccion_fuera_de_rango_se_rechaza_en_la_configuracion(
    entorno: pytest.MonkeyPatch, valor: str
) -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _temperatura_del_cliente(entorno, CORPUS_METADATA_LLM_TEMPERATURE=valor)
