"""Regla pura RN-12 del LLM de la ingesta del corpus (US-118, decidido por el usuario, 2026-10-24)."""

from __future__ import annotations

import pytest

from app.domain.reglas_proveedor import variable_que_incumple_llm_local


def _incumple(**cambios: object) -> str | None:
    base: dict[str, object] = {
        "llm_cloud_enabled": False,
        "llm_provider": "local",
        "llm_base_url": "http://host.docker.internal:11434/v1",
        "llm_model": "gemma4:26b-a4b-it-q4_K_M",
    }
    return variable_que_incumple_llm_local(**{**base, **cambios})  # type: ignore[arg-type]


def test_un_llm_local_sin_nube_no_incumple_ninguna_variable() -> None:
    assert _incumple() is None


def test_la_nube_habilitada_incumple_llm_cloud_enabled() -> None:
    assert _incumple(llm_cloud_enabled=True) == "LLM_CLOUD_ENABLED"


@pytest.mark.parametrize("proveedor", ["fake", "nube", ""])
def test_un_proveedor_distinto_de_local_incumple_llm_provider(proveedor: str) -> None:
    assert _incumple(llm_provider=proveedor) == "LLM_PROVIDER"


def test_con_ambas_incumplidas_se_nombra_primero_llm_cloud_enabled() -> None:
    assert _incumple(llm_cloud_enabled=True, llm_provider="fake") == "LLM_CLOUD_ENABLED"


@pytest.mark.parametrize(
    "url", ["https://api.example.com/v1", "http://10.0.0.5:11434/v1", "not a url", ""]
)
def test_un_host_que_no_es_del_piso_cerrado_incumple_llm_base_url(url: str) -> None:
    assert _incumple(llm_base_url=url) == "LLM_BASE_URL"


@pytest.mark.parametrize("url", ["http://localhost:11434/v1", "http://127.0.0.1:11434/v1"])
def test_un_host_del_piso_cerrado_cumple(url: str) -> None:
    assert _incumple(llm_base_url=url) is None


@pytest.mark.parametrize("modelo", ["gpt-oss:120b-cloud", "x:cloud", "Modelo:CLOUD"])
def test_un_modelo_servido_desde_la_nube_incumple_llm_model_aunque_el_host_sea_local(
    modelo: str,
) -> None:
    assert _incumple(llm_model=modelo) == "LLM_MODEL"


def test_el_orden_de_las_variables_es_nube_proveedor_url_modelo() -> None:
    todo = {"llm_cloud_enabled": True, "llm_provider": "fake", "llm_base_url": "https://x.test/v1"}

    assert _incumple(**todo, llm_model="x:cloud") == "LLM_CLOUD_ENABLED"
    assert _incumple(**{**todo, "llm_cloud_enabled": False}, llm_model="x:cloud") == "LLM_PROVIDER"
    assert _incumple(llm_base_url="https://x.test/v1", llm_model="x:cloud") == "LLM_BASE_URL"
