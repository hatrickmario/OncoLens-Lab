"""Configuración del NLI local (US-231b, RN-22): rutas, SHA-256, datos externos y mapeo de clases por entorno."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.modelos import CLAVES_ADR39
from app.config.settings import Settings

SHA = "a" * 64
CLAVES_DEL_NLI = (
    "NLI_MODEL_PATH",
    "NLI_MODEL_SHA256",
    "NLI_TOKENIZER_PATH",
    "NLI_TOKENIZER_SHA256",
    "NLI_MODEL_DATA_PATH",
    "NLI_MODEL_DATA_SHA256",
    "NLI_LABEL_INDEX_ENTAILMENT",
    "NLI_LABEL_INDEX_NEUTRAL",
    "NLI_LABEL_INDEX_CONTRADICTION",
    "NLI_MAX_LENGTH",
)


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in (*CLAVES_ADR39, *CLAVES_DEL_NLI, "MODEL_PROVIDER"):
        monkeypatch.delenv(clave, raising=False)


def test_las_claves_del_nli_son_opcionales_y_sin_valor_por_defecto_en_codigo_salvo_el_largo() -> (
    None
):
    ajustes = Settings(_env_file=None)

    assert ajustes.nli_model_path is None and ajustes.nli_model_sha256 is None
    assert ajustes.nli_tokenizer_path is None and ajustes.nli_tokenizer_sha256 is None
    assert ajustes.nli_model_data_path is None and ajustes.nli_model_data_sha256 is None
    assert ajustes.nli_label_index_entailment is None
    assert ajustes.nli_max_length == 512


def test_el_entorno_define_rutas_hashes_e_indices_de_clase_del_nli(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave, valor in {
        "NLI_MODEL_PATH": "/modelos/nli/model.onnx",
        "NLI_MODEL_SHA256": SHA.upper(),
        "NLI_TOKENIZER_PATH": "/modelos/nli/tokenizer.json",
        "NLI_TOKENIZER_SHA256": SHA,
        "NLI_LABEL_INDEX_ENTAILMENT": "2",
        "NLI_LABEL_INDEX_NEUTRAL": "0",
        "NLI_LABEL_INDEX_CONTRADICTION": "1",
        "NLI_MAX_LENGTH": "256",
    }.items():
        monkeypatch.setenv(clave, valor)

    ajustes = Settings(_env_file=None)

    assert ajustes.nli_model_path == Path("/modelos/nli/model.onnx")
    assert ajustes.nli_tokenizer_sha256 == SHA
    assert (
        ajustes.nli_label_index_entailment,
        ajustes.nli_label_index_neutral,
        ajustes.nli_label_index_contradiction,
    ) == (2, 0, 1)
    assert ajustes.nli_max_length == 256


@pytest.mark.parametrize("clave", CLAVES_DEL_NLI[:-1])
def test_una_clave_del_nli_vacia_como_la_deja_el_compose_cuenta_como_ausente(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    monkeypatch.setenv(clave, "")

    ajustes = Settings(_env_file=None)

    assert getattr(ajustes, clave.lower()) is None


@pytest.mark.parametrize(
    "clave", ["NLI_MODEL_SHA256", "NLI_TOKENIZER_SHA256", "NLI_MODEL_DATA_SHA256"]
)
def test_un_sha256_del_nli_que_no_es_hexadecimal_se_rechaza_nombrando_la_clave_sin_eco(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    monkeypatch.setenv(clave, "no-es-un-hash-secreto")

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    assert clave in str(error.value).upper() and "no-es-un-hash-secreto" not in str(error.value)


def test_un_largo_maximo_del_nli_no_positivo_se_rechaza(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NLI_MAX_LENGTH", "0")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
