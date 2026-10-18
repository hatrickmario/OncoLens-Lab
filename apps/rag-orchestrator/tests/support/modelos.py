"""Arneses de los modelos locales (US-231a): archivos temporales con su SHA-256, entorno de arranque y subproceso.

La CI no tiene pesos reales (RN-14): los archivos son bytes sintéticos y el arranque en subproceso solo ejercita la
verificación, que falla (o no) antes de cargar ningún runtime.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import settings_de_prueba

RAIZ_APP = RAIZ_REPOSITORIO / "apps" / "rag-orchestrator"

CLAVES_ADR39_DE_PRUEBA: dict[str, str] = {
    "EMBEDDING_MODEL": "BAAI/bge-m3",
    "EMBEDDING_MODEL_REVISION": "rev-embeddings-test",
    "EMBEDDING_DIM": "1024",
    "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
    "RERANKER_MODEL": "BAAI/bge-reranker-v2-m3",
    "RERANKER_MODEL_REVISION": "rev-reranker-test",
    "RERANKER_MAX_PAIRS": "12",
    "RERANKER_MAX_LENGTH": "512",
    "NLI_MODEL": "nli-test",
    "NLI_MODEL_REVISION": "rev-nli-test",
    "MODEL_QUANTIZATION": "int8",
    "NLI_QUANTIZATION": "fp32",
    "CORPUS_CHUNK_SIZE": "1024",
    "CORPUS_CHUNK_OVERLAP": "0",
    "CORPUS_CHUNKING_STRATEGY": "tamano_fijo",
    "VECTOR_INDEX_TYPE": "HNSW",
    "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200}',
    "CHUNK_SELECTION_MARGIN": "0.02",
    "INDEX_MIN_RECALL_VS_FLAT": "0.95",
    "STACK_MEMORY_LIMIT_GB": "30",
    "LLM_MEMORY_BUDGET_GB": "21",
    "STAGE_P95_BUDGET_MS": '{"embeddings": 500, "reranker": 4500}',
    "ACADEMIC_LICENSES": "mit,apache-2.0",
}

# Una variable de ruta y una de SHA-256 por archivo cargado; el contenido es sintético y distinto en cada uno.
ARCHIVOS_DE_MODELO: dict[str, tuple[str, str, bytes]] = {
    "EMBEDDING_MODEL": ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256", b"pesos-sinteticos-emb"),
    "EMBEDDING_TOKENIZER": (
        "EMBEDDING_TOKENIZER_PATH",
        "EMBEDDING_TOKENIZER_SHA256",
        b'{"tokenizer": "emb"}',
    ),
    "RERANKER_MODEL": ("RERANKER_MODEL_PATH", "RERANKER_MODEL_SHA256", b"pesos-sinteticos-rer"),
    "RERANKER_TOKENIZER": (
        "RERANKER_TOKENIZER_PATH",
        "RERANKER_TOKENIZER_SHA256",
        b'{"tokenizer": "rer"}',
    ),
}


def sha256_de(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()


@dataclass(frozen=True)
class EntornoDeModelos:
    """Archivos sintéticos escritos en ``directorio`` y el entorno que los declara (rutas y SHA-256 correctos)."""

    directorio: Path
    variables: dict[str, str]

    def ruta_de(self, variable_ruta: str) -> Path:
        return Path(self.variables[variable_ruta])

    def con(self, **cambios: str | None) -> dict[str, str]:
        """Copia del entorno con las claves cambiadas; ``None`` quita la clave."""
        copia = {**self.variables, **cambios}
        return {k: v for k, v in copia.items() if v is not None}


def crear_entorno_de_modelos(directorio: Path) -> EntornoDeModelos:
    directorio.mkdir(parents=True, exist_ok=True)
    variables: dict[str, str] = {**CLAVES_ADR39_DE_PRUEBA, "MODEL_CACHE_DIR": str(directorio)}
    for nombre, (var_ruta, var_sha, contenido) in ARCHIVOS_DE_MODELO.items():
        archivo = directorio / f"{nombre.lower()}.bin"
        archivo.write_bytes(contenido)
        variables[var_ruta] = str(archivo)
        variables[var_sha] = sha256_de(contenido)
    variables["DATA_CACHE_DIR"] = str(directorio)
    return EntornoDeModelos(directorio, variables)


def entorno_de_arranque(modelos: EntornoDeModelos, **cambios: str | None) -> dict[str, str]:
    """Entorno mínimo de un subproceso que importa ``app.main`` con ``LLM_PROVIDER=fake`` y modelos locales."""
    base = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(RAIZ_APP),
        "APP_ENV": "test",
        "LLM_PROVIDER": "fake",
        "MODEL_PROVIDER": "local",
        "RELEVANCE_THRESHOLD": "0.30",
        "RETRIEVAL_TOP_K": "40",
        "RERANK_TOP_N": "10",
        "PROMPT_VERSION": "rag-query@test",
        "FAKE_RESPONSES_PATH": str(RAIZ_REPOSITORIO / "contracts" / "examples"),
        "SERVICE_JWT_PUBLIC_KEY_FILE": str(settings_de_prueba().service_jwt_public_key_file),
        **modelos.variables,
    }
    resultado = {**base, **cambios}
    return {k: v for k, v in resultado.items() if v is not None}


def arrancar_en_subproceso(entorno: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """Importa ``app.main`` (lo que hace uvicorn al arrancar); devuelve código y stdout/stderr COMPLETOS."""
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def salida_completa(proceso: subprocess.CompletedProcess[str]) -> str:
    return f"{proceso.stdout}\n{proceso.stderr}"


def cargar_modelos_reales():
    """Los adapters con los pesos de ``MODEL_CACHE_DIR`` (tests ``models``): rutas y SHA-256 salen del entorno."""
    from app.config.settings import Settings
    from app.infrastructure.models.local import cargar_modelos_locales

    return cargar_modelos_locales(Settings(_env_file=None, model_provider="local"))  # type: ignore[call-arg]
