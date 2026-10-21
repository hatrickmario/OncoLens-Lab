"""Reglas puras del barrido del umbral (D1) y de la comparación con las metas (AC-3, AC-4): sin adapters ni E/S."""

from __future__ import annotations

import pytest

from app.evaluation.barrido import FilaBarrido, elegir_umbral
from app.evaluation.metas import (
    Meta,
    cargar_metas,
    marcar_frente_a_meta,
    nota_adr42,
)
from tests.evaluation.conftest import RAIZ_APP

TOLERANCIA = 0.05


def fila(umbral: float, exactitud: float | None, recall: float | None) -> FilaBarrido:
    return FilaBarrido(umbral=umbral, exactitud_sin_evidencia=exactitud, recall_at_10=recall)


def test_elegir_umbral_toma_el_de_mayor_exactitud_cuando_el_recall_no_empeora() -> None:
    filas = [fila(0.3, 0.80, 0.90), fila(0.5, 0.95, 0.90), fila(0.7, 0.85, 0.90)]

    eleccion = elegir_umbral(filas, umbral_de_referencia=0.3, tolerancia_recall=TOLERANCIA)

    assert eleccion.umbral == 0.5


def test_elegir_umbral_toma_el_mas_alto_cuando_hay_empate_de_exactitud() -> None:
    filas = [fila(0.3, 1.0, 0.9), fila(0.5, 1.0, 0.9), fila(0.7, 1.0, 0.9)]

    assert elegir_umbral(filas, 0.3, TOLERANCIA).umbral == 0.7


def test_elegir_umbral_descarta_los_valores_cuyo_recall_cae_mas_que_la_tolerancia() -> None:
    filas = [fila(0.3, 0.80, 0.90), fila(0.5, 0.90, 0.86), fila(0.7, 1.00, 0.40)]

    eleccion = elegir_umbral(filas, 0.3, TOLERANCIA)

    assert eleccion.umbral == 0.5
    assert "0.70" in eleccion.justificacion and "recall" in eleccion.justificacion


def test_elegir_umbral_ignora_las_filas_sin_medir_cuando_no_hay_preguntas_de_una_clase() -> None:
    filas = [fila(0.3, 0.8, 0.9), fila(0.5, None, 0.9), fila(0.7, 0.9, None)]

    assert elegir_umbral(filas, 0.3, TOLERANCIA).umbral == 0.3


def test_elegir_umbral_rechaza_una_referencia_fuera_de_la_grilla() -> None:
    with pytest.raises(ValueError, match="referencia"):
        elegir_umbral([fila(0.3, 0.8, 0.9)], umbral_de_referencia=0.4, tolerancia_recall=TOLERANCIA)


def test_marcar_frente_a_meta_distingue_minimo_maximo_y_sin_medir() -> None:
    metas = {
        "mrr": Meta("MRR", minimo=0.60),
        "p95": Meta("p95", maximo=15.0),
        "fidelidad": Meta("fidelidad", minimo=0.90),
    }

    marcadas = marcar_frente_a_meta({"mrr": 0.60, "p95": 15.1, "fidelidad": None}, metas)

    assert {m.clave: m.estado for m in marcadas} == {
        "mrr": "en meta",
        "p95": "fuera de meta",
        "fidelidad": "sin medir",
    }


def test_marcar_frente_a_meta_conserva_el_orden_de_las_metas_y_no_marca_metricas_sin_meta() -> None:
    metas = {"mrr": Meta("MRR", minimo=0.6), "recall": Meta("recall", minimo=0.8)}

    marcadas = marcar_frente_a_meta({"recall": 0.9, "mrr": 0.5, "otra": 1.0}, metas)

    assert [m.clave for m in marcadas] == ["mrr", "recall"]


def test_nota_adr42_solo_aparece_cuando_el_p95_supera_la_meta() -> None:
    assert nota_adr42(18.4, 15.0) is not None and "ADR-42" in (nota_adr42(18.4, 15.0) or "")
    assert nota_adr42(15.0, 15.0) is None
    assert nota_adr42(None, 15.0) is None


def test_cargar_metas_lee_las_metas_iniciales_del_prd() -> None:
    metas = cargar_metas(RAIZ_APP / "eval" / "configs" / "metas-iniciales.yaml")

    assert (metas["recall_at_10"].minimo, metas["p95_evidence_analyses_s"].maximo) == (0.80, 15)
