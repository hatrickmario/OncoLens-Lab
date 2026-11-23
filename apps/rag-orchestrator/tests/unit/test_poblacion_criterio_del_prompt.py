"""El criterio que lleva el prompt de población se lee con la misma definición que lo escribe (L1D-299, S7)."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

import pytest

from app.application.corpus_metadata.esquema_poblacion import (
    DIRECTORIO_DE_PROMPTS,
    PromptSinCriterio,
    cargar_plantilla,
    construir_prompt,
    criterio_del_prompt,
)
from app.application.corpus_metadata.poblacion_puertos import Fragmento, RespuestaDelLlm
from app.evaluation.adaptadores_poblacion import LlmRegistradoDePoblacion
from app.evaluation.guardas import SuiteAbortada
from tests.support.poblacion_abanico import criterios_de_mama

VERSIONES = sorted(p.stem for p in DIRECTORIO_DE_PROMPTS.glob("poblacion_v*.txt"))


@pytest.mark.parametrize("version", VERSIONES)
@pytest.mark.parametrize("criterio", criterios_de_mama(), ids=lambda c: c.clave)
def test_criterio_del_prompt_devuelve_la_clave_con_la_que_se_construyo_cada_plantilla_versionada(
    version: str, criterio: Any
) -> None:
    prompt = construir_prompt(
        cargar_plantilla(version), criterio, [Fragmento("c1", "Criterio: otro_texto")], 3
    )

    assert criterio_del_prompt(prompt) == criterio.clave


def test_criterio_del_prompt_falla_con_su_propio_error_cuando_el_prompt_no_declara_criterio() -> (
    None
):
    with pytest.raises(PromptSinCriterio):
        criterio_del_prompt("un prompt sin la linea del criterio")


class _LlmQueNoSeInvoca:
    async def completar_json_acotado(
        self,
        usuario: str,
        esquema: Mapping[str, Any],
        *,
        max_tokens: int,
        semilla: int,
        sistema: str | None = None,
    ) -> RespuestaDelLlm:
        return RespuestaDelLlm("{}", "stop")


def test_el_registrador_aborta_la_suite_y_no_con_un_assert_cuando_el_prompt_no_declara_criterio() -> (
    None
):
    registrador = LlmRegistradoDePoblacion("doc-x", _LlmQueNoSeInvoca())

    with pytest.raises(SuiteAbortada):
        asyncio.run(registrador.completar_json_acotado("sin criterio", {}, max_tokens=1, semilla=0))
