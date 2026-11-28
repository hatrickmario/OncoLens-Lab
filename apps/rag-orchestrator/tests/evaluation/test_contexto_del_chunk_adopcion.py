"""La adopción de un brazo de contexto exige la regla de los brazos de US-277 (US-279 AC-5; l1d-337 tareas 6.1 y 6.2).

Decisión del usuario del 2026-11-26 (opción B): ``brazos[].adopcion`` se calcula con ``decidir_adopcion`` y la regla propia del contexto.
Todo con adapters falsos: las cifras no dicen nada del RAG real. «Adoptable» es una señal técnica del informe, no adopta nada.
"""

from __future__ import annotations

import asyncio
from dataclasses import replace
from typing import Any

import pytest

from app.evaluation.adopcion_del_brazo import MOTIVO_NO_VIABLE, MOTIVO_RETROCESO
from app.evaluation.armado_comparacion import armar_comparacion
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.corrida_brazos import evaluar_brazos
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.parafrasis_de_la_comparacion import con_parafrasis
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-contexto-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}
DETERMINISTA = "A0-determinista"
LLM = "A0-llm"


@pytest.fixture(scope="module")
def mundo() -> tuple[ConfigSuite, list[Any], dict[str, tuple[str, ...]]]:
    config = cargar_config_suite(CONFIG, ENTORNO)
    base = FuenteDatasetEnDirectorio(config.dataset).cargar()
    dataset, pares = con_parafrasis(base, config.comparacion.parafrasis)  # type: ignore[arg-type]
    brazos = asyncio.run(
        evaluar_brazos(
            config,
            config.comparacion,  # type: ignore[arg-type]
            dataset,
            RelojFijo(),
            lambda: Cronometro(RelojSimulado()),
            None,
        )
    )
    return config, brazos, pares


def _brazos_armados(
    mundo: tuple[ConfigSuite, list[Any], dict[str, tuple[str, ...]]],
    *,
    tolerancia: float | None = None,
    memoria: dict[str, float] | None = None,
) -> dict[str, dict[str, Any]]:
    config, brazos, pares = mundo
    comparacion = config.comparacion
    if tolerancia is not None:
        comparacion = replace(comparacion, tolerancia_retroceso=tolerancia)  # type: ignore[type-var]
    seccion = armar_comparacion(
        config,
        comparacion,  # type: ignore[arg-type]
        brazos,
        pares_de_parafrasis=pares,
        memoria_del_stack=memoria,
    ).seccion
    return {b["nombre"]: b for b in seccion["brazos"]}


@pytest.mark.ac("US-279", 5)
def test_los_brazos_de_contexto_llevan_adopcion_con_motivos_y_la_referencia_no_se_compara_consigo_misma(
    mundo: tuple[ConfigSuite, list[Any], dict[str, tuple[str, ...]]],
) -> None:
    """[US-279 AC-5] ``brazos[].adopcion`` existe en ``determinista`` y ``llm``; sin memoria medida nunca es ``true`` (null ≠ 0.0)."""
    armados = _brazos_armados(mundo)

    assert "adopcion" not in armados["A0"]
    for nombre in (DETERMINISTA, LLM):
        assert "adopcion" in armados[nombre], nombre
        adopcion = armados[nombre]["adopcion"]
        assert set(adopcion) == {"adoptable", "motivos"}, nombre
        assert adopcion["adoptable"] is not True, nombre  # la memoria del stack no se midió
        assert all(isinstance(m, str) for m in adopcion["motivos"])


@pytest.mark.ac("US-279", 5)
def test_un_brazo_de_contexto_con_retroceso_no_es_adoptable_con_su_motivo(
    mundo: tuple[ConfigSuite, list[Any], dict[str, tuple[str, ...]]],
) -> None:
    """[US-279 AC-5] Con tolerancia 0 cualquier caída de MRR o de recall@10 es retroceso: ``adoptable`` false con el motivo."""
    armados = _brazos_armados(mundo, tolerancia=0.0)

    for nombre in (DETERMINISTA, LLM):
        assert armados[nombre]["retroceso"] is True, nombre
        assert "adopcion" in armados[nombre], nombre
        assert armados[nombre]["adopcion"]["adoptable"] is False, nombre
        assert MOTIVO_RETROCESO in armados[nombre]["adopcion"]["motivos"], nombre


@pytest.mark.ac("US-279", 5)
def test_un_brazo_de_contexto_fuera_de_los_topes_de_memoria_no_es_adoptable_con_su_motivo(
    mundo: tuple[ConfigSuite, list[Any], dict[str, tuple[str, ...]]],
) -> None:
    """[US-279 AC-5] La memoria del stack sobre el límite de ADR-39 deja la viabilidad en ``no_viable`` y ``adoptable`` en false."""
    armados = _brazos_armados(mundo, memoria={DETERMINISTA: 99.0, LLM: 99.0})

    for nombre in (DETERMINISTA, LLM):
        assert armados[nombre]["viabilidad"]["estado"] == "no_viable", nombre
        assert "adopcion" in armados[nombre], nombre
        assert armados[nombre]["adopcion"]["adoptable"] is False, nombre
        assert MOTIVO_NO_VIABLE in armados[nombre]["adopcion"]["motivos"], nombre
