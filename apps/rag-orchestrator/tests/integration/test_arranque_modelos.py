"""Arranque con modelos locales (US-231a AC-7): verificación de pesos y matriz estricta de proveedores.

Cada escenario de fallo arranca en SUBPROCESO y afirma sobre stdout + stderr COMPLETOS: el nombre de la variable
aparece y la ruta, el hash esperado y el calculado jamás (RN-22, RN-14).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.modelos import (
    RAIZ_APP,
    arrancar_en_subproceso,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    salida_completa,
    sha256_de,
)
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.service_jwt import con_token_valido


@pytest.mark.ac("US-231a", 7)
def test_arranque_con_hash_alterado_termina_nombrando_la_variable_de_sha_sin_rutas_ni_hashes(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de("RERANKER_MODEL_PATH")
    esperado = modelos.variables["RERANKER_MODEL_SHA256"]
    ruta.write_bytes(b"pesos-alterados")
    calculado = sha256_de(b"pesos-alterados")

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "RERANKER_MODEL_SHA256" in salida
    assert str(ruta) not in salida and esperado not in salida and calculado not in salida


@pytest.mark.ac("US-231a", 7)
def test_arranque_con_archivo_ausente_termina_nombrando_la_variable_de_ruta_sin_la_ruta(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de("EMBEDDING_MODEL_PATH")
    ruta.unlink()

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "EMBEDDING_MODEL_PATH" in salida
    assert str(ruta) not in salida


def test_arranque_con_proveedor_fake_no_verifica_ni_importa_ningun_runtime_de_modelos(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    modelos.ruta_de("RERANKER_MODEL_PATH").unlink()
    entorno = entorno_de_arranque(modelos, MODEL_PROVIDER="fake")

    proceso = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys, app.main; sys.exit(1 if {'onnxruntime', 'tokenizers'} & set(sys.modules) else 0)",
        ],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    assert proceso.returncode == 0, salida_completa(proceso)


@pytest.mark.ac("US-231a", 7)
@pytest.mark.parametrize("valor", ["nube-secreta-xyz", ""])
def test_arranque_con_valor_fuera_del_enum_termina_nombrando_model_provider_sin_eco_del_valor(
    tmp_path: Path, valor: str
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos, MODEL_PROVIDER=valor))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "MODEL_PROVIDER" in salida
    if valor:
        assert valor not in salida


@pytest.mark.ac("US-231a", 7)
@pytest.mark.parametrize("bandera", ["REAL_ANONYMIZED_ENABLED", "REAL_IDENTIFIED_ENABLED"])
def test_arranque_con_datos_reales_y_model_provider_fake_termina_nombrando_model_provider(
    tmp_path: Path, bandera: str
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = entorno_de_arranque(
        modelos, LLM_PROVIDER="local", MODEL_PROVIDER="fake", **{bandera: "true"}
    )

    proceso = arrancar_en_subproceso(entorno)

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "MODEL_PROVIDER" in salida


@pytest.mark.ac("US-231a", 7)
def test_rag_query_con_llm_local_y_modelos_fake_responde_503_sin_recuperar_ni_invocar_al_llm() -> (
    None
):
    app = crear_app(
        settings_de_prueba(
            llm_provider="local",
            model_provider="fake",
            nli_model="nli-test@1",
            prompt_version="rag-query@test",
        ),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert_matches_spec("#/paths/~1rag~1query/post/responses/503", respuesta.json())
