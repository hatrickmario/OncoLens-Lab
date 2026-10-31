"""Configuración de los modelos de recuperación y verificación y del *chunking* e índice (ADR-39, RN-22).

Los valores salen de ADR-39 y viven solo aquí (y en ``.env.example``): ni el código ni
``docs/architecture/data-model.md`` los repiten. En los tests, ``EMBEDDING_DIM=8`` con adapters falsos (FX-06c).
``Settings.modelos`` lo compone desde el entorno (opcional: la producción no exige estas claves).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.domain.corpus_seed.chunking import validar_ventana

CLAVES_MODELOS = (
    "EMBEDDING_MODEL",
    "EMBEDDING_MODEL_REVISION",
    "EMBEDDING_DIM",
    "SPARSE_VECTOR_SOURCE",
    "RERANKER_MODEL",
    "RERANKER_MODEL_REVISION",
    "RERANKER_MAX_PAIRS",
    "RERANKER_MAX_LENGTH",
    "NLI_MODEL",
    "NLI_MODEL_REVISION",
    "MODEL_QUANTIZATION",
    "NLI_QUANTIZATION",
    "MODEL_CACHE_DIR",
)
CLAVES_CHUNKING_E_INDICE = (
    "CORPUS_CHUNK_SIZE",
    "CORPUS_CHUNK_OVERLAP",
    "CORPUS_CHUNKING_STRATEGY",
    "VECTOR_INDEX_TYPE",
    "VECTOR_INDEX_PARAMS",
    "CHUNK_SELECTION_MARGIN",
    "INDEX_MIN_RECALL_VS_FLAT",
    "DATA_CACHE_DIR",
)
CLAVES_RESTRICCIONES = (
    "STACK_MEMORY_LIMIT_GB",
    "LLM_MEMORY_BUDGET_GB",
    "STAGE_P95_BUDGET_MS",
    "ACADEMIC_LICENSES",
)
CLAVES_ADR39 = CLAVES_MODELOS + CLAVES_CHUNKING_E_INDICE + CLAVES_RESTRICCIONES

ESTRATEGIAS_CHUNKING = ("tamano_fijo", "estructura")
TIPOS_INDICE = ("FLAT", "HNSW")
CUANTIZACIONES = ("int8", "fp32")
# Origen del vector sparse (ADR-39): única lista, la usan ConfigModelos y CorpusIngestSettings.
SPARSE_VECTOR_SOURCES_ADMITIDAS = ("modelo_embeddings",)


class ConfigInvalida(ValueError):
    """Falta una clave o su valor no es válido; el mensaje lista todas las claves con problema.

    ``claves`` expone solo los NOMBRES: quien informa de un valor inválido no debe reconstruirlos parseando el mensaje,
    que puede repetir el valor (y un valor con «; » o una ruta rompería el parseo)."""

    def __init__(self, mensaje: str, claves: tuple[str, ...] = ()) -> None:
        super().__init__(mensaje)
        self.claves = claves


@dataclass(frozen=True)
class ConfigModelos:
    embedding_model: str
    embedding_model_revision: str
    embedding_dim: int
    sparse_vector_source: str
    reranker_model: str
    reranker_model_revision: str
    reranker_max_pairs: int
    reranker_max_length: int
    nli_model: str
    nli_model_revision: str
    model_quantization: str
    nli_quantization: str
    model_cache_dir: str
    corpus_chunk_size: int
    corpus_chunk_overlap: int
    corpus_chunking_strategy: str
    vector_index_type: str
    vector_index_params: dict[str, Any]
    chunk_selection_margin: float
    index_min_recall_vs_flat: float
    data_cache_dir: str
    stack_memory_limit_gb: float
    llm_memory_budget_gb: float
    stage_p95_budget_ms: dict[str, float]
    academic_licenses: frozenset[str]


def entero_positivo(valor: str) -> int:
    numero = int(valor)
    if numero <= 0:
        raise ValueError("debe ser un entero positivo")
    return numero


def _entero_no_negativo(valor: str) -> int:
    numero = int(valor)
    if numero < 0:
        raise ValueError("no puede ser negativo")
    return numero


def opcion(*validas: str):
    def validar(valor: str) -> str:
        if valor not in validas:
            raise ValueError(f"debe ser uno de {validas}")
        return valor

    return validar


def _texto_no_vacio(valor: str) -> str:
    if not valor.strip():
        raise ValueError("no puede estar vacío")
    return valor.strip()


def _proporcion(valor: str) -> float:
    numero = float(valor)
    if not 0.0 <= numero <= 1.0:
        raise ValueError("debe estar entre 0 y 1")
    return numero


def _mapa_json(valor: str) -> dict[str, Any]:
    cargado = json.loads(valor)
    if not isinstance(cargado, dict):
        raise ValueError("debe ser un objeto JSON")
    return cargado


def _presupuestos(valor: str) -> dict[str, float]:
    return {k: float(v) for k, v in _mapa_json(valor).items()}


def _conjunto(valor: str) -> frozenset[str]:
    elementos = frozenset(x.strip() for x in valor.split(",") if x.strip())
    if not elementos:
        raise ValueError("debe listar al menos una licencia")
    return elementos


_VALIDADORES = {
    "EMBEDDING_MODEL": _texto_no_vacio,
    "EMBEDDING_MODEL_REVISION": _texto_no_vacio,
    "EMBEDDING_DIM": entero_positivo,
    "SPARSE_VECTOR_SOURCE": opcion(*SPARSE_VECTOR_SOURCES_ADMITIDAS),
    "RERANKER_MODEL": _texto_no_vacio,
    "RERANKER_MODEL_REVISION": _texto_no_vacio,
    "RERANKER_MAX_PAIRS": entero_positivo,
    "RERANKER_MAX_LENGTH": entero_positivo,
    "NLI_MODEL": _texto_no_vacio,
    "NLI_MODEL_REVISION": _texto_no_vacio,
    "MODEL_QUANTIZATION": opcion(*CUANTIZACIONES),
    "NLI_QUANTIZATION": opcion(*CUANTIZACIONES),
    "MODEL_CACHE_DIR": _texto_no_vacio,
    "CORPUS_CHUNK_SIZE": entero_positivo,
    "CORPUS_CHUNK_OVERLAP": _entero_no_negativo,
    "CORPUS_CHUNKING_STRATEGY": opcion(*ESTRATEGIAS_CHUNKING),
    "VECTOR_INDEX_TYPE": opcion(*TIPOS_INDICE),
    "VECTOR_INDEX_PARAMS": _mapa_json,
    "CHUNK_SELECTION_MARGIN": _proporcion,
    "INDEX_MIN_RECALL_VS_FLAT": _proporcion,
    "DATA_CACHE_DIR": _texto_no_vacio,
    "STACK_MEMORY_LIMIT_GB": float,
    "LLM_MEMORY_BUDGET_GB": float,
    "STAGE_P95_BUDGET_MS": _presupuestos,
    "ACADEMIC_LICENSES": _conjunto,
}


def cargar_config_modelos(entorno: Mapping[str, str]) -> ConfigModelos:
    """Valida todas las claves de ADR-39 y devuelve la configuración tipada; reporta todos los problemas juntos."""
    valores: dict[str, Any] = {}
    problemas: list[str] = []
    claves_con_problema: list[str] = []
    for clave in CLAVES_ADR39:
        crudo = entorno.get(clave)
        if crudo is None or crudo == "":
            problemas.append(f"{clave}: falta")
            claves_con_problema.append(clave)
            continue
        try:
            valores[clave] = _VALIDADORES[clave](crudo)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            problemas.append(f"{clave}: {exc}")
            claves_con_problema.append(clave)
    if not problemas:
        try:
            validar_ventana(valores["CORPUS_CHUNK_SIZE"], valores["CORPUS_CHUNK_OVERLAP"])
        except ValueError as exc:
            problemas.append(f"CORPUS_CHUNK_OVERLAP: {exc}")
            claves_con_problema.append("CORPUS_CHUNK_OVERLAP")
    if problemas:
        raise ConfigInvalida("; ".join(problemas), tuple(claves_con_problema))
    return ConfigModelos(**{clave.lower(): valor for clave, valor in valores.items()})
