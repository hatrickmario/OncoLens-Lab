"""Arranque con el NLI local (US-231b AC-4): pesos, tokenizer, mapeo de clases y datos externos del ONNX.

Cada escenario arranca en SUBPROCESO y afirma sobre stdout + stderr COMPLETOS: el nombre de la variable aparece y la
ruta, el hash esperado, el calculado y los valores configurados jamás (RN-22, RN-14).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from tests.support.modelos import (
    RAIZ_APP,
    arrancar_en_subproceso,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    salida_completa,
    sha256_de,
)
from tests.support.onnx_minimo import onnx_con_datos_externos, onnx_identidad, tokenizer_json


@pytest.mark.ac("US-231b", 4)
def test_arranque_con_hash_alterado_del_nli_termina_nombrando_nli_model_sha256_sin_rutas_ni_hashes(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de("NLI_MODEL_PATH")
    esperado = modelos.variables["NLI_MODEL_SHA256"]
    ruta.write_bytes(b"pesos-alterados")
    calculado = sha256_de(b"pesos-alterados")

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "NLI_MODEL_SHA256" in salida
    assert str(ruta) not in salida and esperado not in salida and calculado not in salida


@pytest.mark.ac("US-231b", 4)
def test_arranque_con_archivo_del_nli_ausente_termina_nombrando_nli_model_path_sin_la_ruta(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de("NLI_MODEL_PATH")
    ruta.unlink()

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "NLI_MODEL_PATH" in salida
    assert str(ruta) not in salida


@pytest.mark.ac("US-231b", 4)
def test_arranque_con_tokenizer_del_nli_alterado_termina_nombrando_nli_tokenizer_sha256(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    ruta = modelos.ruta_de("NLI_TOKENIZER_PATH")
    ruta.write_bytes(b'{"tokenizer": "alterado"}')

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "NLI_TOKENIZER_SHA256" in salida
    assert str(ruta) not in salida and modelos.variables["NLI_TOKENIZER_SHA256"] not in salida


@pytest.mark.ac("US-231b", 4)
@pytest.mark.parametrize(
    ("cambios", "variable", "valor_secreto"),
    [
        ({"NLI_LABEL_INDEX_ENTAILMENT": "738291046"}, "NLI_LABEL_INDEX_ENTAILMENT", "738291046"),
        (
            {"NLI_LABEL_INDEX_CONTRADICTION": "-738291046"},
            "NLI_LABEL_INDEX_CONTRADICTION",
            "738291046",
        ),
        ({"NLI_LABEL_INDEX_NEUTRAL": "0"}, "NLI_LABEL_INDEX_NEUTRAL", None),
        ({"NLI_LABEL_INDEX_NEUTRAL": None}, "NLI_LABEL_INDEX_NEUTRAL", None),
    ],
    ids=["fuera-de-rango", "negativo", "repetido", "ausente"],
)
def test_arranque_con_mapeo_de_clases_invalido_termina_nombrando_la_variable_de_indice_sin_su_valor(
    tmp_path: Path, cambios: dict[str, str | None], variable: str, valor_secreto: str | None
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")

    proceso = arrancar_en_subproceso(entorno_de_arranque(modelos, **cambios))

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert variable in salida
    if valor_secreto is not None:
        assert valor_secreto not in salida


@pytest.mark.ac("US-231b", 4)
def test_arranque_con_onnx_de_datos_externos_sin_su_par_verificado_termina_nombrando_nli_model_data_path(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(
        tmp_path / "modelos",
        {
            "EMBEDDING_MODEL": onnx_identidad(),
            "EMBEDDING_TOKENIZER": tokenizer_json("<pad>"),
            "RERANKER_MODEL": onnx_identidad(),
            "RERANKER_TOKENIZER": tokenizer_json("<pad>"),
            "NLI_MODEL": onnx_con_datos_externos("datos-del-nli.bin"),
            "NLI_TOKENIZER": tokenizer_json("[PAD]"),
        },
    )
    # El peor caso: el .data existe junto al .onnx y el proceso arranca con ese directorio como cwd, de modo que
    # una referencia relativa SÍ resolvería si la sesión se creara desde la ruta en vez de desde los bytes verificados.
    datos = modelos.directorio / "datos-del-nli.bin"
    datos.write_bytes(b"\x00\x00\x80\x3f")

    proceso = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=modelos.directorio,
        env=entorno_de_arranque(modelos, PYTHONPATH=str(RAIZ_APP)),
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "NLI_MODEL_DATA_PATH" in salida
    assert str(datos) not in salida and str(modelos.ruta_de("NLI_MODEL_PATH")) not in salida
    assert modelos.variables["NLI_MODEL_SHA256"] not in salida
