"""Medición de latencia por etapa (US-231a AC-9, NFR-01): mediana de corridas con reloj inyectado, sin pesos."""

from __future__ import annotations

import json

import pytest

from tests.support.latencia import (
    Etapa,
    informe_de_latencia,
    mediana,
    medir_etapa,
)


class RelojDeMedicion:
    """Reloj monótono (segundos) que avanza lo que cada llamada simulada le indica."""

    def __init__(self) -> None:
        self.ahora = 0.0

    def __call__(self) -> float:
        return self.ahora


def _etapa(reloj: RelojDeMedicion, duraciones_s: list[float]):
    pendientes = iter(duraciones_s)

    def ejecutar() -> None:
        reloj.ahora += next(pendientes)

    return ejecutar


def test_la_mediana_de_un_numero_impar_de_corridas_es_la_central() -> None:
    assert mediana([30.0, 10.0, 20.0]) == 20.0


def test_la_mediana_de_un_numero_par_promedia_las_dos_centrales() -> None:
    assert mediana([1.0, 2.0, 3.0, 10.0]) == 2.5


def test_la_mediana_de_una_lista_vacia_es_un_error() -> None:
    with pytest.raises(ValueError):
        mediana([])


def test_medir_etapa_devuelve_milisegundos_por_corrida_y_descarta_el_calentamiento() -> None:
    reloj = RelojDeMedicion()
    ejecutar = _etapa(reloj, [9.0, 0.1, 0.3, 0.2])  # la primera es de calentamiento

    tomas = medir_etapa(ejecutar, reloj, corridas=3, calentamiento=1)

    assert tomas == pytest.approx([100.0, 300.0, 200.0])


def test_el_informe_marca_cumple_cuando_la_mediana_esta_dentro_del_presupuesto() -> None:
    informe = informe_de_latencia([Etapa("embeddings", [400.0, 450.0, 500.0], 500.0)])

    assert informe["embeddings"] == {
        "corridas_ms": [400.0, 450.0, 500.0],
        "mediana_ms": 450.0,
        "presupuesto_ms": 500.0,
        "dentro_de_presupuesto": True,
    }


def test_el_informe_reporta_el_exceso_en_lugar_de_ocultarlo_ni_ajustar_el_presupuesto() -> None:
    informe = informe_de_latencia([Etapa("reranker", [5000.0, 5200.0, 5100.0], 4500.0)])

    assert informe["reranker"]["dentro_de_presupuesto"] is False
    assert informe["reranker"]["presupuesto_ms"] == 4500.0
    assert informe["reranker"]["exceso_ms"] == pytest.approx(600.0)


def test_el_informe_es_serializable_y_no_lleva_texto_de_entrada() -> None:
    texto = json.dumps(informe_de_latencia([Etapa("embeddings", [1.0, 2.0, 3.0], 500.0)]))

    assert "embeddings" in texto and "Q-HER2" not in texto
