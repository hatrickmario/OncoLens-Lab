"""Reglas puras de la comparación de brazos (US-133, ADR-45 P1): diferencia, retroceso y trazado esperado."""

from __future__ import annotations

import pytest

from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.evaluation.brazos_recuperacion import (
    Brazo,
    MetricasDeBrazo,
    diferencia_frente_referencia,
    marcar_retroceso,
    trazado_coherente,
)
from app.schemas.generated.models import Fusion, RetrievalMode

DENSE = Brazo("A0", RetrievalMode.dense)
RRF = Brazo("A2", RetrievalMode.hibrida, EstrategiaDeFusion.rrf, rrf_k=60)
PONDERADA = Brazo("A2b", RetrievalMode.hibrida, EstrategiaDeFusion.ponderada, peso_sparse=0.3)


def metricas(total: float | None, es_a_en: float | None, mrr: float | None) -> MetricasDeBrazo:
    return MetricasDeBrazo(total, es_a_en, mrr)


def test_la_diferencia_es_brazo_menos_a0_por_metrica() -> None:
    diferencia = diferencia_frente_referencia(metricas(0.9, 0.7, 0.5), metricas(0.8, 0.8, 0.5))

    assert diferencia.como_tupla() == pytest.approx((0.1, -0.1, 0.0))


def test_la_diferencia_es_nula_y_no_cero_cuando_falta_una_de_las_dos_metricas() -> None:
    diferencia = diferencia_frente_referencia(metricas(0.9, None, 0.5), metricas(0.8, 0.8, None))

    assert diferencia.recall_at_10_es_a_en is None
    assert diferencia.mrr is None


def test_un_brazo_con_una_metrica_peor_que_la_tolerancia_es_retroceso() -> None:
    assert marcar_retroceso(metricas(0.0, -0.06, 0.1), tolerancia=0.05) is True


def test_una_caida_igual_a_la_tolerancia_no_es_retroceso() -> None:
    assert marcar_retroceso(metricas(-0.05, 0.0, 0.0), tolerancia=0.05) is False


def test_una_diferencia_nula_no_se_toma_por_retroceso() -> None:
    assert marcar_retroceso(metricas(None, None, None), tolerancia=0.0) is False


def test_una_tolerancia_negativa_es_un_error() -> None:
    with pytest.raises(ValueError):
        marcar_retroceso(metricas(0.0, 0.0, 0.0), tolerancia=-0.01)


@pytest.mark.parametrize(
    ("brazo", "esperado"),
    [
        (DENSE, (RetrievalMode.dense, Fusion.ninguna, 0)),
        (RRF, (RetrievalMode.hibrida, Fusion.rrf, 60)),
        (PONDERADA, (RetrievalMode.hibrida, Fusion.ponderada, 0.3)),
    ],
)
def test_el_trazado_esperado_de_cada_brazo_no_lleva_nulos(
    brazo: Brazo, esperado: tuple[RetrievalMode, Fusion, float]
) -> None:
    assert brazo.trazado_esperado() == esperado


def test_un_brazo_hibrido_sin_parametro_de_fusion_no_tiene_trazado() -> None:
    with pytest.raises(ValueError):
        Brazo("X", RetrievalMode.hibrida, EstrategiaDeFusion.rrf).trazado_esperado()


def test_el_trazado_de_otro_brazo_no_es_coherente() -> None:
    assert trazado_coherente(RRF, RetrievalMode.hibrida, Fusion.rrf, 60) is True
    assert trazado_coherente(RRF, RetrievalMode.hibrida, Fusion.ponderada, 0.3) is False
    assert trazado_coherente(DENSE, RetrievalMode.hibrida, Fusion.ninguna, 0) is False


def test_la_huella_de_un_brazo_cambia_con_su_parametro() -> None:
    otro = Brazo("A2", RetrievalMode.hibrida, EstrategiaDeFusion.rrf, rrf_k=61)

    assert RRF.huella() != otro.huella()
    assert (
        RRF.huella()
        == Brazo("A2", RetrievalMode.hibrida, EstrategiaDeFusion.rrf, rrf_k=60).huella()
    )
