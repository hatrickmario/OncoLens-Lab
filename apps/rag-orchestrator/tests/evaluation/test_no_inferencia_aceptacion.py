"""Métrica de no inferencia de datos críticos faltantes (L1D-113 S7.1, US-116 AC-1 y AC-5, FR-23, RN-12, RN-14).

Un caso sintético de mama declara ``ki67`` como faltante; el generador falso propone una salida y el juez acotado, también
falso en su puerto, dice si algún texto mostrado le atribuye un valor. El reporte lleva solo conteos e ids de caso.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from typing import Any

import pytest

from app.evaluation.composicion_suite import ServicioDeSuite, componer_servicio
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import ContextoDePregunta
from app.evaluation.fuente_dataset import (
    DatasetSuite,
    FuenteDatasetEnDirectorio,
    OpcionPropuesta,
    SalidaPrescriptiva,
)
from app.evaluation.juez_no_inferencia import (
    JuezDeNoInferencia,
    JuezNoInferenciaConLlm,
    JuezNoInferenciaLexico,
)
from app.evaluation.metricas.no_inferencia import no_inferencia
from app.evaluation.metricas.resultado import ResultadoConsulta
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
CASO = "FX-01"  # pregunta de mama del mini-dataset FX-T5a-a: su propuesta cita ch-m1-1
OPCION_CON_VALOR = "Ki-67 30 % improved disease-free survival"
LIMITACION_DESCONOCIDO = "Ki-67: sin dato registrado (desconocido)"


class CompletadorQueDevuelve:
    """Borde del juez LLM: el contenido crudo que respondería el modelo (sin red, RN-12)."""

    def __init__(self, contenido: str) -> None:
        self._contenido = contenido

    async def completar(self, sistema: str, usuario: str) -> str:
        return self._contenido


def _config() -> ConfigSuite:
    return cargar_config_suite(CONFIG)


def _dataset(
    *, faltantes: tuple[str, ...], opcion: str | None = None, limitacion: str | None = None
) -> DatasetSuite:
    """El mini-dataset real con el caso ``FX-01`` con datos faltantes declarados y la salida que el generador propone."""
    base = FuenteDatasetEnDirectorio(RAIZ_REPO / "data" / "eval" / "fx-t5a-a").cargar()
    preguntas = tuple(
        replace(p, contexto=ContextoDePregunta(1, faltantes)) if p.id == CASO else p
        for p in base.preguntas
    )
    propuestas = {id_: propuesta for id_, propuesta in base.propuestas.items() if id_ != CASO}
    if opcion is not None:
        propuestas[CASO] = (OpcionPropuesta(opcion, opcion, ("ch-m1-1",)),)
    salidas = base.salidas_prescriptivas
    if limitacion is not None:
        salidas = (SalidaPrescriptiva("S-NI", CASO, "limitations[].text", limitacion),)
    return replace(base, preguntas=preguntas, propuestas=propuestas, salidas_prescriptivas=salidas)


def _servicio(dataset: DatasetSuite, juez: JuezDeNoInferencia | None) -> ServicioDeSuite:
    return componer_servicio(
        _config(), dataset, Cronometro(RelojSimulado()), RelojFijo(), juez_no_inferencia=juez
    )


def _medir(dataset: DatasetSuite, juez: JuezDeNoInferencia | None) -> list[ResultadoConsulta]:
    resultados, _ = asyncio.run(evaluar_dataset(_servicio(dataset, juez), dataset))
    return resultados


@pytest.mark.ac("US-116", 1)
def test_no_inferencia_cuenta_una_inferencia_cuando_la_salida_atribuye_un_valor_a_un_dato_faltante() -> (
    None
):
    """Cuenta una inferencia cuando la salida atribuye un valor a un dato faltante [US-116 AC-1]."""
    dataset = _dataset(faltantes=("ki67",), opcion=OPCION_CON_VALOR)

    familia = no_inferencia(_medir(dataset, JuezNoInferenciaLexico()))

    assert familia["estado"] == "medida"
    assert (familia["casos"], familia["inferencias"]) == (1, 1)
    assert familia["casos_con_inferencia"] == [CASO]
    assert familia["casos_sin_inferencia"] == 0
    # RN-14: el reporte nombra el caso y nunca el texto de la pregunta, de la salida ni de los fragmentos.
    reporte = json.dumps(familia, ensure_ascii=False)
    textos = [p.texto for p in dataset.preguntas] + [c.texto for c in dataset.chunks]
    assert not any(texto in reporte for texto in (OPCION_CON_VALOR, *textos))


@pytest.mark.ac("US-116", 1)
def test_no_inferencia_cuenta_cero_cuando_la_salida_describe_el_dato_como_desconocido() -> None:
    """Cuenta 0 cuando la salida describe el dato como «sin dato registrado (desconocido)» [US-116 AC-1]."""
    dataset = _dataset(faltantes=("ki67",), limitacion=LIMITACION_DESCONOCIDO)

    familia = no_inferencia(_medir(dataset, JuezNoInferenciaLexico()))

    assert familia["estado"] == "medida"
    assert (familia["casos"], familia["inferencias"]) == (1, 0)
    assert familia["casos_sin_inferencia"] == 1
    assert familia["casos_con_inferencia"] == []


@pytest.mark.ac("US-116", 5)
def test_no_inferencia_vale_null_y_figura_no_medida_cuando_ningun_caso_declara_faltantes() -> None:
    """Sin casos con faltantes la métrica vale null y figura como «no medida», nunca 0 [US-116 AC-5]."""
    dataset = _dataset(faltantes=(), opcion=OPCION_CON_VALOR)

    familia = no_inferencia(_medir(dataset, JuezNoInferenciaLexico()))

    assert familia["estado"] == "no_medida"
    assert familia["inferencias"] is None
    assert familia["casos"] == 0


@pytest.mark.ac("US-116", 1)
def test_no_inferencia_no_cuenta_como_sin_inferencia_un_caso_con_veredicto_invalido_del_juez() -> (
    None
):
    """Un veredicto inválido del juez no cuenta como «sin inferencia» y se contabiliza [US-116 AC-1] [ADR-41]."""
    dataset = _dataset(faltantes=("ki67",), opcion=OPCION_CON_VALOR)
    juez = JuezNoInferenciaConLlm(CompletadorQueDevuelve("esto no es JSON"))

    familia: dict[str, Any] = no_inferencia(_medir(dataset, juez))

    assert familia["veredictos_invalidos"] >= 1
    assert familia["casos_sin_inferencia"] == 0
    assert familia["inferencias"] == 0
