from __future__ import annotations

from pathlib import Path

import pytest
from app.config.modelos import CLAVES_ADR39, ConfigInvalida, cargar_config_modelos
from app.evaluation.chequeo_config import (
    chequear,
    dimension_con_literal,
    ejecutar_chequeo,
    leer_bloque_decision,
    leer_env,
)

VALORES = {
    "EMBEDDING_MODEL": "org/embedding",
    "EMBEDDING_MODEL_REVISION": "a" * 40,
    "EMBEDDING_DIM": "1024",
    "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
    "RERANKER_MODEL": "org/reranker",
    "RERANKER_MODEL_REVISION": "b" * 40,
    "RERANKER_MAX_PAIRS": "24",
    "RERANKER_MAX_LENGTH": "512",
    "NLI_MODEL": "org/nli",
    "NLI_MODEL_REVISION": "c" * 40,
    "MODEL_QUANTIZATION": "int8",
    "MODEL_CACHE_DIR": "/models",
    "CORPUS_CHUNK_SIZE": "512",
    "CORPUS_CHUNK_OVERLAP": "0",
    "CORPUS_CHUNKING_STRATEGY": "tamano_fijo",
    "VECTOR_INDEX_TYPE": "FLAT",
    "VECTOR_INDEX_PARAMS": "{}",
    "CHUNK_SELECTION_MARGIN": "0.02",
    "INDEX_MIN_RECALL_VS_FLAT": "0.99",
    "DATA_CACHE_DIR": "/data-cache",
    "STACK_MEMORY_LIMIT_GB": "24",
    "LLM_MEMORY_BUDGET_GB": "16",
    "STAGE_P95_BUDGET_MS": '{"embeddings": 500, "reranker": 2000, "nli": 1500}',
    "ACADEMIC_LICENSES": "mit,apache-2.0",
}
MODELO_DATOS_OK = (
    '        vector dense_vector "dimensión EMBEDDING_DIM (configuración, sin valor fijo); modelo (ADR-39) — vacío resuelto (US-033)"\n'
    "| `dense_vector` | vector |  | dimensión EMBEDDING_DIM (ADR-10, RN-05, RN-22) |\n"
)


def escribir_arbol(raiz: Path, env: dict[str, str], decision: dict[str, str] | None = None, modelo_datos: str = MODELO_DATOS_OK) -> None:
    decision = VALORES if decision is None else decision
    adr = raiz / "docs/architecture/adr/ADR-39-modelos-locales.md"
    adr.parent.mkdir(parents=True)
    cuerpo = "\n".join(f'{k}: "{v}"' for k, v in decision.items())
    adr.write_text(f"# ADR-39\n\n<!-- adr39:decision:inicio -->\n```yaml\n{cuerpo}\n```\n<!-- adr39:decision:fin -->\n", encoding="utf-8")
    entorno = raiz / "apps/rag-orchestrator/.env.example"
    entorno.parent.mkdir(parents=True)
    entorno.write_text("# modelos\n" + "\n".join(f"{k}={v}" for k, v in env.items()) + "\n", encoding="utf-8")
    modelo = raiz / "docs/architecture/data-model.md"
    modelo.write_text(modelo_datos, encoding="utf-8")


def test_cargar_config_modelos_valida_y_tipa_todas_las_claves() -> None:
    config = cargar_config_modelos(VALORES)

    assert config.embedding_dim == 1024 and config.stage_p95_budget_ms["reranker"] == 2000.0
    assert config.academic_licenses == frozenset({"mit", "apache-2.0"}) and config.vector_index_params == {}


def test_cargar_config_modelos_acepta_embedding_dim_8_de_los_tests_con_adapters_falsos() -> None:
    assert cargar_config_modelos({**VALORES, "EMBEDDING_DIM": "8"}).embedding_dim == 8


def test_cargar_config_modelos_reporta_todas_las_claves_con_problema_juntas() -> None:
    entorno = {k: v for k, v in VALORES.items() if k != "EMBEDDING_DIM"} | {"MODEL_QUANTIZATION": "int4", "CORPUS_CHUNK_OVERLAP": "900"}

    with pytest.raises(ConfigInvalida) as error:
        cargar_config_modelos(entorno)

    assert "EMBEDDING_DIM: falta" in str(error.value) and "MODEL_QUANTIZATION" in str(error.value)


def test_cargar_config_modelos_rechaza_solapamiento_igual_o_mayor_que_el_tamano() -> None:
    with pytest.raises(ConfigInvalida, match="CORPUS_CHUNK_OVERLAP"):
        cargar_config_modelos({**VALORES, "CORPUS_CHUNK_OVERLAP": "512"})


def test_leer_env_ignora_comentarios_y_comentarios_en_linea() -> None:
    assert leer_env("# c\nA=1 # nota\n\nB='x y'\n") == {"A": "1", "B": "x y"}


@pytest.mark.ac("US-012", 3)
def test_chequear_configuracion_coherente_con_el_adr_pasa_ac3(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, VALORES)

    assert chequear(tmp_path).ok
    assert ejecutar_chequeo(tmp_path) == 0


@pytest.mark.ac("US-012", 3)
def test_chequear_falla_si_embedding_dim_falta_en_la_configuracion_ac3(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, {k: v for k, v in VALORES.items() if k != "EMBEDDING_DIM"})

    resultado = chequear(tmp_path)

    assert not resultado.ok and any("falta EMBEDDING_DIM" in p for p in resultado.problemas)
    assert ejecutar_chequeo(tmp_path) == 5


@pytest.mark.ac("US-012", 3)
def test_chequear_falla_si_sparse_vector_source_difiere_del_adr_ac3(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, {**VALORES, "SPARSE_VECTOR_SOURCE": "bm25"})

    resultado = chequear(tmp_path)

    assert any("SPARSE_VECTOR_SOURCE" in p and "difiere" in p for p in resultado.problemas)


@pytest.mark.ac("US-012", 3)
def test_chequear_falla_si_la_dimension_difiere_del_adr_ac3(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, {**VALORES, "EMBEDDING_DIM": "768"})

    assert any("EMBEDDING_DIM" in p and "difiere" in p for p in chequear(tmp_path).problemas)


@pytest.mark.ac("US-012", 12)
def test_chequear_extendido_valida_chunking_e_indice_contra_el_adr_ac12(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, {**VALORES, "VECTOR_INDEX_TYPE": "HNSW"})

    problemas = chequear(tmp_path).problemas

    assert any("VECTOR_INDEX_TYPE" in p and "difiere" in p for p in problemas)


def test_chequear_sin_bloque_de_decision_en_el_adr_falla(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, VALORES, decision={})
    (tmp_path / "docs/architecture/adr/ADR-39-modelos-locales.md").write_text("# ADR-39 sin decidir\n", encoding="utf-8")

    assert any("sin bloque de decisión" in p for p in chequear(tmp_path).problemas)


@pytest.mark.ac("US-012", 3)
def test_dimension_con_literal_detecta_un_numero_fijado_en_data_model_ac3() -> None:
    mala = 'vector dense_vector "dimensión 1024"\n'

    assert dimension_con_literal(MODELO_DATOS_OK) == []
    assert dimension_con_literal(mala) == ["docs/architecture/data-model.md:1"]


def test_chequear_falla_si_data_model_fija_la_dimension(tmp_path: Path) -> None:
    escribir_arbol(tmp_path, VALORES, modelo_datos='| `dense_vector` | vector | dimensión 1024 |\n')

    assert any("literal" in p for p in chequear(tmp_path).problemas)


def test_leer_bloque_decision_devuelve_texto_por_clave() -> None:
    texto = '<!-- adr39:decision:inicio -->\n```yaml\nEMBEDDING_DIM: 1024\nSPARSE_VECTOR_SOURCE: x\n```\n<!-- adr39:decision:fin -->'

    assert leer_bloque_decision(texto) == {"EMBEDDING_DIM": "1024", "SPARSE_VECTOR_SOURCE": "x"}


def test_todas_las_claves_de_adr39_estan_en_el_conjunto_declarado() -> None:
    assert set(VALORES) == set(CLAVES_ADR39)
