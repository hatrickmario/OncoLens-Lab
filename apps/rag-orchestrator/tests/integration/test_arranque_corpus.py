"""Arranque con modelos y LLM locales: el corpus real se compone y se sonda, o el proceso termina (US-231b AC-9, RN-22).

Subproceso con stdout + stderr COMPLETOS: el error nombra la variable y jamás la URI, el host, el puerto, el DSN ni la
contraseña, y no se recurre a un corpus falso. Los servicios apuntan a un puerto cerrado.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from tests.support.modelos import (
    RAIZ_APP,
    EntornoDeModelos,
    arrancar_en_subproceso,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    salida_completa,
)

CONTRASENA = "contrasena-secreta-del-catalogo"


def _entorno_local(
    modelos: EntornoDeModelos, tmp_path: Path, **cambios: str | None
) -> dict[str, str]:
    secreto = tmp_path / "pg_rag_corpus_password"
    secreto.write_text(CONTRASENA)
    base: dict[str, str | None] = {
        "LLM_PROVIDER": "local",
        "MILVUS_URI": "http://127.0.0.1:1",
        "MILVUS_DENSE_METRIC_TYPE": "COSINE",
        "MILVUS_CONNECT_TIMEOUT_SECONDS": "2",
        "CORPUS_DATABASE_URL": "postgresql+psycopg://rag_corpus@127.0.0.1:1/oncolens?sslmode=require",
        "PG_RAG_CORPUS_PASSWORD_FILE": str(secreto),
        **cambios,
    }
    return entorno_de_arranque(modelos, **base)


@pytest.mark.ac("US-231b", 9)
def test_arranque_con_catalogo_inaccesible_termina_nombrando_corpus_database_url_sin_host_dsn_ni_contrasena(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    proceso = arrancar_en_subproceso(_entorno_local(modelos, tmp_path))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "CORPUS_DATABASE_URL" in salida
    assert "127.0.0.1" not in salida and "oncolens" not in salida and CONTRASENA not in salida
    assert "postgresql" not in salida and "5432" not in salida


@pytest.mark.ac("US-231b", 9)
def test_arranque_sin_milvus_uri_termina_nombrando_la_variable(tmp_path: Path) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    proceso = arrancar_en_subproceso(_entorno_local(modelos, tmp_path, MILVUS_URI=None))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "MILVUS_URI" in salida
    assert "127.0.0.1" not in salida and CONTRASENA not in salida


@pytest.mark.ac("US-231b", 9)
def test_arranque_con_modelos_fake_no_compone_el_corpus_ni_importa_milvus_ni_runtimes(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = _entorno_local(modelos, tmp_path, MODEL_PROVIDER="fake")

    proceso = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys, app.main; "
            "sys.exit(1 if {'pymilvus', 'onnxruntime', 'tokenizers'} & set(sys.modules) else 0)",
        ],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert proceso.returncode == 0, salida_completa(proceso)
