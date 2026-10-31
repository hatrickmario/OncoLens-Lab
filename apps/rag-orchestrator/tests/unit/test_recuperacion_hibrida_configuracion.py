"""Configuración de la recuperación híbrida (US-112, RN-22): settings, arranque y cableado del codificador sparse."""

from __future__ import annotations

import io
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.application.aplicabilidad_textual import ParametrosDelRespaldo
from app.application.rag_orchestrator_service import ParametrosDeRecuperacion
from app.schemas.generated.models import LlmProvider
from app.bootstrap import ConfiguracionDeRecuperacionIncompleta, crear_app
from app.config.settings import AjustesSparse, Settings
from app.infrastructure.models.local import (
    cargar_embeddings_y_sparse_de_pasajes,
    cargar_modelos_locales,
)
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.inferencia_falsa import TokenizadorFalso
from tests.support.modelos import (
    EntornoDeModelos,
    crear_entorno_de_modelos,
    fabricar_sesion_falsa,
    settings_de_modelos,
    sha256_de,
)
from tests.support.recuperacion import (
    BuscadorFalso,
    EmbedderSparseFalso,
    puertos_de_recuperacion,
    solicitud_de,
)
from tests.support.recuperacion_hibrida import (
    _SPARSE_DE_LA_PREGUNTA,
    CORPUS_HIBRIDO,
    Q_KEYWORD,
    _EmbedderConVectorPropioParaQKeyword,
)
from tests.support.service_jwt import con_token_valido


def _settings(**cambios: object) -> Settings:
    return Settings(_env_file=None, **cambios)  # type: ignore[call-arg, arg-type]


def test_settings_acepta_la_constante_rrf_minima_uno():
    assert _settings(rrf_k=1).rrf_k == 1


def test_settings_recupera_en_dense_con_rrf_k_60_y_peso_0_3_cuando_no_se_define_nada():
    ajustes = _settings()

    assert ajustes.retrieval_mode == "dense"
    assert ajustes.retrieval_fusion == "rrf"
    assert ajustes.rrf_k == 60
    assert ajustes.hybrid_sparse_weight == 0.3


def test_los_valores_iniciales_de_la_fusion_son_los_mismos_en_settings_y_en_los_parametros_del_servicio():
    ajustes = _settings()
    parametros = ParametrosDeRecuperacion(
        relevance_threshold=0.3,
        retrieval_top_k=1,
        rerank_top_n=1,
        longitud_maxima_codigo_tipo=64,
        llm_provider=LlmProvider.local,
        llm_model="m",
        nli_entailment_threshold=0.7,
        tipos_habilitados=(),
        claim_max_words=20,
        respaldo=ParametrosDelRespaldo(plazo_ms=1, concurrencia=1, version_del_prompt="p"),
    )

    assert parametros.rrf_k == ajustes.rrf_k
    assert parametros.peso_sparse == ajustes.hybrid_sparse_weight


@pytest.mark.parametrize(
    "cambios",
    [
        {"retrieval_mode": "sparse"},
        {"retrieval_fusion": "borda"},
        {"rrf_k": 0},
        {"hybrid_sparse_weight": 0.0},
        {"hybrid_sparse_weight": 1.0},
    ],
)
def test_settings_falla_al_arrancar_cuando_el_valor_de_la_recuperacion_hibrida_es_invalido(cambios):
    with pytest.raises(ValidationError):
        _settings(**cambios)


def _puertos_hibridos():
    buscador = BuscadorFalso(CORPUS_HIBRIDO)
    return replace(
        puertos_de_recuperacion(),
        embedder=_EmbedderConVectorPropioParaQKeyword(),
        buscador=buscador,
        buscador_sparse=buscador,
        embedder_sparse=EmbedderSparseFalso(_SPARSE_DE_LA_PREGUNTA),
    )


def _cliente(puertos, **cambios: object) -> TestClient:
    settings = settings_de_prueba(llm_provider="local", retrieval_top_k=2, **cambios)
    app = crear_app(
        settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), recuperacion=puertos
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def test_el_arranque_cablea_el_modo_hibrido_de_la_configuracion_hasta_la_respuesta():
    cliente = _cliente(_puertos_hibridos(), retrieval_mode="hibrida")

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    params = respuesta.json()["meta"]["retrievalParams"]
    assert (params["retrievalMode"], params["fusion"], params["fusionParam"]) == (
        "hibrida",
        "rrf",
        60,
    )


def test_el_arranque_cablea_la_fusion_ponderada_y_su_peso_de_la_configuracion():
    cliente = _cliente(
        _puertos_hibridos(),
        retrieval_mode="hibrida",
        retrieval_fusion="ponderada",
        hybrid_sparse_weight=0.4,
    )

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_KEYWORD))

    params = respuesta.json()["meta"]["retrievalParams"]
    assert (params["fusion"], params["fusionParam"]) == ("ponderada", 0.4)


@pytest.mark.parametrize("faltante", ["buscador_sparse", "embedder_sparse"])
def test_el_arranque_se_niega_cuando_el_modo_es_hibrido_y_falta_una_rama_sparse(faltante):
    puertos = replace(_puertos_hibridos(), **{faltante: None})

    with pytest.raises(ConfiguracionDeRecuperacionIncompleta, match="hibrida"):
        _cliente(puertos, retrieval_mode="hibrida")


def test_el_arranque_en_dense_no_exige_la_rama_sparse():
    respuesta = _cliente(puertos_de_recuperacion()).post("/rag/query", json=solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200


# --- Consistencia índice/consulta del sparse (US-112 D6, tarea 2.7) ---------------------------------------------------


@pytest.fixture
def modelos(tmp_path: Path) -> EntornoDeModelos:
    return crear_entorno_de_modelos(tmp_path / "modelos")


def _npz() -> bytes:
    buffer = io.BytesIO()
    np.savez(
        buffer,
        weight=np.linspace(0.1, 1.0, 1024, dtype=np.float32).reshape(1, 1024),
        bias=np.array([0.5], np.float32),
    )
    return buffer.getvalue()


def _definir_sparse(
    directorio: Path, monkeypatch: pytest.MonkeyPatch, contenido: bytes
) -> AjustesSparse:
    ruta = directorio / "sparse_linear.npz"
    ruta.write_bytes(contenido)
    for clave, valor in {
        "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
        "EMBEDDING_SPARSE_WEIGHTS_PATH": str(ruta),
        "EMBEDDING_SPARSE_WEIGHTS_SHA256": sha256_de(contenido),
    }.items():
        monkeypatch.setenv(clave, valor)
    return AjustesSparse(_env_file=None)  # type: ignore[call-arg]


def _fabricas():
    return {
        "fabricar_sesion": fabricar_sesion_falsa(1024),
        "fabricar_tokenizador": lambda ruta: TokenizadorFalso(),
    }


def test_el_sparse_de_la_consulta_es_el_mismo_vector_que_el_de_la_ingesta_cuando_el_texto_coincide(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ajustes = _definir_sparse(tmp_path, monkeypatch, _npz())
    _, de_ingesta = cargar_embeddings_y_sparse_de_pasajes(
        settings_de_modelos(modelos), ajustes, **_fabricas()
    )

    cargados = cargar_modelos_locales(
        settings_de_modelos(modelos, retrieval_mode="hibrida"), **_fabricas()
    )

    assert cargados.embedder_sparse_consulta is not None
    texto = "variante PIK3CA E545K en cáncer de mama"
    assert (
        dict(cargados.embedder_sparse_consulta.embeber_sparse(texto))
        == de_ingesta.codificar([texto])[0]
    )


def test_no_carga_el_sparse_de_la_consulta_cuando_el_modo_es_dense(
    modelos: EntornoDeModelos,
) -> None:
    cargados = cargar_modelos_locales(settings_de_modelos(modelos), **_fabricas())

    assert cargados.embedder_sparse_consulta is None


def test_nombra_la_variable_cuando_el_modo_es_hibrido_y_los_pesos_sparse_estan_alterados(
    modelos: EntornoDeModelos, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    ajustes = _definir_sparse(tmp_path, monkeypatch, _npz())
    ajustes.embedding_sparse_weights_path.write_bytes(b"alterado")

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos, retrieval_mode="hibrida"), **_fabricas()
        )

    assert error.value.variable == "EMBEDDING_SPARSE_WEIGHTS_SHA256"


def test_nombra_la_variable_cuando_el_modo_es_hibrido_y_falta_la_configuracion_del_sparse(
    modelos: EntornoDeModelos, monkeypatch: pytest.MonkeyPatch
) -> None:
    for clave in ("SPARSE_VECTOR_SOURCE", "EMBEDDING_SPARSE_WEIGHTS_PATH"):
        monkeypatch.delenv(clave, raising=False)

    with pytest.raises(ModeloNoVerificadoError) as error:
        cargar_modelos_locales(
            settings_de_modelos(modelos, retrieval_mode="hibrida"), **_fabricas()
        )

    assert error.value.variable in {"SPARSE_VECTOR_SOURCE", "EMBEDDING_SPARSE_WEIGHTS_PATH"}
