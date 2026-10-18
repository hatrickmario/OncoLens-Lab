"""``python -m app.scripts.load_seed_corpus`` sin servicios: configuración, adapter real y manifiesto inválido."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config.settings import CorpusSeedSettings
from app.infrastructure.embeddings.bge_m3 import EmbedderDePasajesBgeM3
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from app.scripts import load_seed_corpus
from tests.support.inferencia_falsa import TokenizadorFalso
from tests.support.modelos import (
    crear_entorno_de_modelos,
    fabricar_sesion_falsa,
    settings_de_modelos,
)
from tests.support.semilla import MANIFIESTO_FX_06C_A, EmbedderFalso

ENTORNO_VALIDO = {
    "CORPUS_SEED_MANIFEST_PATH": str(MANIFIESTO_FX_06C_A),
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
    "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
    "CORPUS_CUTOFF_DATE": "2026-10-16",
    "CORPUS_CHUNK_SIZE": "12",
    "CORPUS_CHUNK_OVERLAP": "0",
    "MILVUS_URI": "http://milvus.invalid:19530",
    "EMBEDDING_DIM": "8",
    "VECTOR_INDEX_TYPE": "HNSW",
    "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200, "ef": 64}',
    "MILVUS_DENSE_METRIC_TYPE": "COSINE",
    "CORPUS_DATABASE_URL": "postgresql+psycopg://rag_corpus@postgres.invalid:5432/oncolens?sslmode=require",
    "PG_RAG_CORPUS_PASSWORD_FILE": "/run/secrets/no-existe",
}


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for clave, valor in ENTORNO_VALIDO.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)
    return monkeypatch


@pytest.mark.parametrize(
    "clave", ["CORPUS_CUTOFF_DATE", "CORPUS_ACCEPTED_LICENSES", "EMBEDDING_DIM"]
)
def test_una_clave_obligatoria_ausente_sale_con_1_nombrandola_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], clave: str
) -> None:
    entorno.delenv(clave)

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and clave in capturado.err and capturado.out == ""


@pytest.mark.parametrize(("valor", "esperado"), [(None, False), ("true", True), ("false", False)])
def test_allow_cc_by_nc_se_lee_por_settings_aunque_el_entorno_traiga_claves_parciales_de_adr39(
    entorno: pytest.MonkeyPatch, valor: str | None, esperado: bool
) -> None:
    if valor is not None:
        entorno.setenv("ALLOW_CC_BY_NC", valor)

    assert load_seed_corpus.allow_cc_by_nc_del_entorno() is esperado


@pytest.mark.parametrize("permitir", [True, False])
def test_la_politica_lleva_la_configuracion_del_cargador_y_el_permiso_recibido(
    entorno: pytest.MonkeyPatch, permitir: bool
) -> None:
    ajustes = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]

    politica = load_seed_corpus.politica_de_licencias(ajustes, permitir)

    assert politica.permitir_cc_by_nc is permitir
    assert politica.aceptadas == {"dominio_publico", "cc_by", "cc_by_sa"}
    assert politica.excluidas == ("NCCN", "ESMO")


def test_un_valor_invalido_sale_con_1_nombrando_la_clave_y_sin_mostrar_el_valor(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("CORPUS_ACCEPTED_LICENSES", "cc_by_nd")

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    error = capsys.readouterr().err
    assert codigo == 1 and "CORPUS_ACCEPTED_LICENSES" in error and "cc_by_nd" not in error


def test_con_model_provider_fake_el_cargador_sale_con_1_nombrando_la_variable_sin_usar_un_embedder_falso(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.delenv("MODEL_PROVIDER", raising=False)

    codigo = load_seed_corpus.main()

    capturado = capsys.readouterr()
    assert codigo == 1 and "MODEL_PROVIDER" in capturado.err and capturado.out == ""


@pytest.mark.ac("US-231b", 8)
def test_fabricar_embedder_real_devuelve_el_adapter_de_pasajes_de_us231a_con_los_pesos_verificados(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    embedder = load_seed_corpus.fabricar_embedder_real(
        settings_de_modelos(modelos),
        fabricar_sesion=fabricar_sesion_falsa(1024),
        fabricar_tokenizador=lambda ruta: TokenizadorFalso(),
    )

    assert isinstance(embedder, EmbedderDePasajesBgeM3)
    assert len(embedder.embeber(["her2"])[0]) == 1024


@pytest.mark.ac("US-231b", 8)
def test_fabricar_embedder_real_con_model_provider_fake_falla_nombrando_la_variable_sin_devolver_un_embedder_falso(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    with pytest.raises(ModeloNoVerificadoError) as error:
        load_seed_corpus.fabricar_embedder_real(settings_de_modelos(modelos, model_provider="fake"))

    assert error.value.variable == "MODEL_PROVIDER"


def test_un_manifiesto_ilegible_sale_con_1_antes_de_conectarse_a_las_bases(
    entorno: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("CORPUS_SEED_MANIFEST_PATH", str(tmp_path / "no-existe.yaml"))

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and "manifiesto" in capturado.err and str(tmp_path) not in capturado.err


def test_una_dependencia_obligatoria_que_falla_sale_con_1_nombrando_solo_la_clase_del_error(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    error = capsys.readouterr().err
    assert codigo == 1 and error.startswith("load_seed_corpus: falló (")
    assert "postgres.invalid" not in error and "no-existe" not in error  # ni hosts ni rutas


def test_el_cliente_http_del_cargador_no_hereda_proxies_ni_certificados_del_entorno(
    entorno: pytest.MonkeyPatch,
) -> None:
    """El único egreso del cargador no debe desviarse por HTTPS_PROXY, ALL_PROXY o SSL_CERT_FILE del entorno."""
    entorno.setenv("CORPUS_FETCH_ALLOWED_HOSTS", "www.cancer.gov")
    entorno.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
    ajustes = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]

    fuente = load_seed_corpus._fuente_de_texto(ajustes)

    assert fuente._descargador is not None
    assert fuente._descargador._cliente.trust_env is False
