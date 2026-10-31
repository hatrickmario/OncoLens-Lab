"""Configuración del LLM local y del OCR de ADR-39 fase B (US-224 AC-4, RN-22): valores del entorno, sin nombres literales."""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
import pytest
import respx
from pydantic import ValidationError

from app.infrastructure.llm.fabrica_local import crear_generador_local
from app.config.modelos import CLAVES_ADR39
from app.config.settings import Settings
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient

RAIZ_APP = Path(__file__).resolve().parents[2] / "app"
NOMBRE_DE_MODELO = re.compile(
    r"\b(gemma\d*|medgemma[\d.]*|qwen[\d.]*|llama\d+|mistral)\b", re.IGNORECASE
)
CLAVES = (
    "LLM_BASE_URL",
    "LLM_MODEL",
    "LLM_NUM_CTX",
    "LLM_TEMPERATURE",
    "LLM_CLOUD_ENABLED",
    "OCR_ENGINE",
    "OCR_LANGUAGES",
)
URL_LLM = "http://llm-nativo.test:11434/v1"


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in (*CLAVES_ADR39, *CLAVES, "MODEL_PROVIDER"):
        monkeypatch.delenv(clave, raising=False)


@pytest.mark.ac("US-224", 4)
def test_settings_lee_el_runtime_el_modelo_el_contexto_la_temperatura_y_el_ocr_del_entorno(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_BASE_URL", "http://host.docker.internal:11434/v1")
    monkeypatch.setenv("LLM_MODEL", "modelo-de-prueba:1b")
    monkeypatch.setenv("LLM_NUM_CTX", "4096")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.2")
    monkeypatch.setenv("OCR_ENGINE", "paddleocr")
    monkeypatch.setenv("OCR_LANGUAGES", "spa+eng")

    ajustes = Settings(_env_file=None)

    assert ajustes.llm_base_url == "http://host.docker.internal:11434/v1"
    assert ajustes.llm_model == "modelo-de-prueba:1b"
    assert (ajustes.llm_num_ctx, ajustes.llm_temperature) == (4096, 0.2)
    assert (ajustes.ocr_engine, ajustes.ocr_languages) == ("paddleocr", "spa+eng")
    assert ajustes.llm_cloud_enabled is False


def test_settings_usa_los_valores_decididos_del_s1_cuando_el_entorno_no_los_define() -> None:
    ajustes = Settings(_env_file=None)

    assert ajustes.llm_num_ctx == 8192  # [S1 resp. 10]
    assert ajustes.llm_temperature == 0.0
    assert (ajustes.ocr_engine, ajustes.ocr_languages) == ("ocrmypdf-tesseract", "spa")
    assert (
        ajustes.llm_model == ""
    )  # lo fija el ADR-39 al aprobarse; sin modelo literal en el código
    assert ajustes.llm_cloud_enabled is False  # RN-12


@pytest.mark.parametrize(
    ("clave", "valor"),
    [
        ("LLM_NUM_CTX", "0"),
        ("LLM_TEMPERATURE", "-0.1"),
        ("OCR_ENGINE", "surya"),
        ("OCR_LANGUAGES", ""),
    ],
)
def test_settings_rechaza_valores_invalidos_nombrando_la_clave(
    monkeypatch: pytest.MonkeyPatch, clave: str, valor: str
) -> None:
    monkeypatch.setenv(clave, valor)

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    assert clave.lower() in str(error.value)


def test_ningun_nombre_de_modelo_aparece_literal_fuera_de_la_configuracion() -> None:
    ofensores = {
        str(p.relative_to(RAIZ_APP)): sorted(
            set(NOMBRE_DE_MODELO.findall(p.read_text(encoding="utf-8")))
        )
        for p in RAIZ_APP.rglob("*.py")
        if "schemas/generated" not in p.as_posix()
    }

    assert {k: v for k, v in ofensores.items() if v} == {}


@pytest.mark.anyio
async def test_el_cliente_del_llm_envia_la_temperatura_configurada_y_0_por_defecto() -> None:
    with respx.mock() as llm:
        ruta = llm.post(f"{URL_LLM}/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        )

        await OpenAICompatibleLlmClient(URL_LLM, "m", 2000, 64).completar_json("p", {})
        await OpenAICompatibleLlmClient(URL_LLM, "m", 2000, 64, 0.3).completar_json("p", {})

    assert [json.loads(c.request.content)["temperature"] for c in ruta.calls] == [0.0, 0.3]


@pytest.mark.anyio
async def test_crear_generador_local_propaga_la_temperatura_de_la_configuracion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "LLM_ALLOWED_HOSTS", "llm-nativo.test"
    )  # RN-12: host declarado en la lista permitida
    monkeypatch.setenv("LLM_BASE_URL", URL_LLM)
    monkeypatch.setenv("LLM_MODEL", "m")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.4")
    generador = crear_generador_local(Settings(_env_file=None))

    with respx.mock() as llm:
        ruta = llm.post(f"{URL_LLM}/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        )
        await generador._cliente.completar_json(
            "p", {}
        )  # el cliente es el borde: se observa su petición HTTP

    assert json.loads(ruta.calls[0].request.content)["temperature"] == 0.4
