"""El cargador de la semilla con modelos locales (US-231b AC-8): verifica TODO lo que abre y no revela rutas ni hashes.

Subproceso con stdout + stderr COMPLETOS. Los servicios (PostgreSQL y Milvus) apuntan a un puerto cerrado: si el cargador
verificara tarde, el error sería de conexión y no nombraría la variable del tokenizer.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from tests.support.modelos import (
    RAIZ_APP,
    EntornoDeModelos,
    crear_entorno_de_modelos,
    salida_completa,
)
from tests.support.semilla import MANIFIESTO_FX_06C_A


def _entorno_del_cargador(modelos: EntornoDeModelos, **cambios: str | None) -> dict[str, str]:
    base = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": str(RAIZ_APP),
        "APP_ENV": "test",
        "CORPUS_SEED_MANIFEST_PATH": str(MANIFIESTO_FX_06C_A),
        "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
        "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
        "CORPUS_CUTOFF_DATE": "2026-10-16",
        "MILVUS_URI": "http://127.0.0.1:1",
        "MILVUS_DENSE_METRIC_TYPE": "COSINE",
        "CORPUS_DATABASE_URL": "postgresql+psycopg://rag_corpus@127.0.0.1:1/oncolens?sslmode=require",
        "PG_RAG_CORPUS_PASSWORD_FILE": str(modelos.directorio / "no-existe"),
        "MODEL_PROVIDER": "local",
        **modelos.variables,
    }
    resultado = {**base, **cambios}
    return {k: v for k, v in resultado.items() if v is not None}


def _correr_el_cargador(entorno: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "app.scripts.load_seed_corpus"],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


@pytest.mark.ac("US-231b", 8)
@pytest.mark.parametrize(
    ("archivo", "variable"),
    [
        ("EMBEDDING_TOKENIZER_PATH", "EMBEDDING_TOKENIZER_SHA256"),
        ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256"),
    ],
)
def test_el_cargador_con_un_archivo_de_embeddings_alterado_termina_nombrando_la_variable_sin_rutas_ni_hashes(
    tmp_path: Path, archivo: str, variable: str
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de(archivo)
    esperado = modelos.variables[variable]
    ruta.write_bytes(b"alterado")

    proceso = _correr_el_cargador(_entorno_del_cargador(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert variable in salida
    assert str(ruta) not in salida and esperado not in salida
