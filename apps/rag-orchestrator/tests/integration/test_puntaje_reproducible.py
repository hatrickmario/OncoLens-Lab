"""Puntaje reproducible entre procesos (US-231a AC-6, IA-07, ADR-8).

Mismos pares y misma configuración dan el mismo ``relevance_score`` en procesos distintos: sin semilla variable, con
los hilos de ONNX Runtime fijados por configuración y un orden de lote estable.
"""

from __future__ import annotations

import os
import subprocess
import sys

import onnxruntime as ort
import pytest

from app.infrastructure.models.onnx import crear_opciones_de_sesion
from tests.support.modelos import RAIZ_APP


def _puntajes_en_un_proceso_nuevo(semilla_de_hash: str, *argumentos: str) -> str:
    entorno = {**os.environ, "PYTHONPATH": str(RAIZ_APP), "PYTHONHASHSEED": semilla_de_hash}
    proceso = subprocess.run(
        [sys.executable, "-m", "tests.support.determinismo", *argumentos],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert proceso.returncode == 0, proceso.stderr
    return proceso.stdout


@pytest.mark.ac("US-231a", 6)
def test_dos_procesos_distintos_dan_el_mismo_relevance_score_con_los_hilos_fijados_por_configuracion() -> (
    None
):
    primero = _puntajes_en_un_proceso_nuevo("1")
    segundo = _puntajes_en_un_proceso_nuevo("2")

    opciones = crear_opciones_de_sesion(3)

    assert primero == segundo and primero.strip() != ""
    assert opciones.intra_op_num_threads == 3
    assert opciones.inter_op_num_threads == 1
    assert opciones.execution_mode == ort.ExecutionMode.ORT_SEQUENTIAL


@pytest.mark.models
@pytest.mark.ac("US-231a", 6)
def test_dos_procesos_distintos_dan_el_mismo_relevance_score_con_los_pesos_reales() -> None:
    primero = _puntajes_en_un_proceso_nuevo("1", "--real")
    segundo = _puntajes_en_un_proceso_nuevo("2", "--real")

    assert primero == segundo and primero.strip() != ""
