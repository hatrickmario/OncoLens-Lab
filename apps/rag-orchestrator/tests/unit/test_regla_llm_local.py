"""Regla pura RN-12 del LLM de la ingesta del corpus (US-118, decidido por el usuario, 2026-10-24)."""

from __future__ import annotations

import pytest

from app.domain.reglas_proveedor import variable_que_incumple_llm_local


def test_un_llm_local_sin_nube_no_incumple_ninguna_variable() -> None:
    assert variable_que_incumple_llm_local(llm_cloud_enabled=False, llm_provider="local") is None


def test_la_nube_habilitada_incumple_llm_cloud_enabled() -> None:
    assert (
        variable_que_incumple_llm_local(llm_cloud_enabled=True, llm_provider="local")
        == "LLM_CLOUD_ENABLED"
    )


@pytest.mark.parametrize("proveedor", ["fake", "nube", ""])
def test_un_proveedor_distinto_de_local_incumple_llm_provider(proveedor: str) -> None:
    assert (
        variable_que_incumple_llm_local(llm_cloud_enabled=False, llm_provider=proveedor)
        == "LLM_PROVIDER"
    )


def test_con_ambas_incumplidas_se_nombra_primero_llm_cloud_enabled() -> None:
    assert (
        variable_que_incumple_llm_local(llm_cloud_enabled=True, llm_provider="fake")
        == "LLM_CLOUD_ENABLED"
    )
