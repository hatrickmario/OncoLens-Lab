"""El respaldo de población de la suite local sale de la configuración, no de constantes (US-244, Gate 2 vuelta 2).

RN-22: si el entorno fija ``POPULATION_*``, el servicio compuesto por la suite usa esos valores y el reporte no atribuye
la medida a otros. Además, el cliente local que envuelve la suite cumple los dos puertos del LLM (LSP/ISP).
"""

from pathlib import Path

import pytest

from app.config.settings import Settings
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.modelos_locales import LlmRegistrado
from app.infrastructure.llm.fabrica_local import (
    ClienteLlmLocal,
    crear_proponente_local,
    parametros_del_respaldo,
)
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from tests.evaluation.test_tercera_ronda_gate2 import _servicio_local


def test_la_suite_local_compone_el_respaldo_con_el_plazo_y_la_concurrencia_del_entorno(
    tmp_path: Path,
) -> None:
    puertos, servicio = _servicio_local(
        tmp_path,
        RegistroDeLlamadas(),
        POPULATION_FALLBACK_DEADLINE_MS="5000",
        POPULATION_EXTRACTION_CONCURRENCY="3",
    )

    respaldo = servicio.servicio._parametros.respaldo  # noqa: SLF001
    assert (respaldo.plazo_ms, respaldo.concurrencia) == (5000, 3)
    assert puertos.respaldo == respaldo


def test_parametros_del_respaldo_leen_la_version_del_prompt_de_la_configuracion() -> None:
    ajustes = Settings(
        _env_file=None,  # type: ignore[call-arg]
        population_prompt_version="poblacion_v2",
        population_fallback_deadline_ms=5000,
    )

    respaldo = parametros_del_respaldo(ajustes)

    assert (respaldo.version_del_prompt, respaldo.plazo_ms) == ("poblacion_v2", 5000)


@pytest.mark.parametrize(
    "construir",
    [
        lambda: OpenAICompatibleLlmClient("http://localhost:1/v1", "m", 1000, 10, 0.0),
        lambda: LlmRegistrado(
            OpenAICompatibleLlmClient("http://localhost:1/v1", "m", 1000, 10, 0.0),
            RegistroDeLlamadas(),
            destino="d",
            clase="sintetico",
            modelo="m",
        ),
    ],
    ids=["adapter", "registrado"],
)
def test_el_cliente_local_y_su_envoltorio_cumplen_los_dos_puertos_del_llm(construir) -> None:
    assert isinstance(construir(), ClienteLlmLocal)


def test_crear_proponente_local_rechaza_llm_y_envoltorio_a_la_vez() -> None:
    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]

    with pytest.raises(ValueError):
        crear_proponente_local(ajustes, envolver_cliente=lambda c: c, llm=object())  # type: ignore[arg-type]
