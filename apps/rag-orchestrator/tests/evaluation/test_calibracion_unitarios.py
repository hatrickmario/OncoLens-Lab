"""Reglas puras de elección de la calibración (US-120 AC-5, RN-01, RN-22): sin archivos, adapters ni configuración."""

from __future__ import annotations

from app.evaluation.barrido import (
    FilaDeCalibracion,
    MetasDeEntailment,
    elegir_top_k,
    elegir_umbral_entailment,
)

METAS = MetasDeEntailment(precision_citas_minima=0.90, sin_evidencia_minima=0.90)


def fila(
    valor: float,
    *,
    fidelidad: float | None = 0.93,
    precision: float | None = 0.92,
    sin_evidencia: float | None = 0.95,
    recall: float | None = 0.80,
    p95_busqueda_ms: float | None = None,
) -> FilaDeCalibracion:
    return FilaDeCalibracion(
        valor, fidelidad, precision, sin_evidencia, recall, 0.7, p95_busqueda_ms
    )


def test_elige_el_umbral_de_mayor_fidelidad_entre_los_que_cumplen_las_metas() -> None:
    filas = [fila(0.5, fidelidad=0.90), fila(0.7, fidelidad=0.95)]

    eleccion = elegir_umbral_entailment(filas, METAS, provisional=0.7)

    assert (eleccion.valor, eleccion.sin_valor_elegible) == (0.7, False)


def test_descarta_el_umbral_cuya_precision_de_citas_esta_bajo_la_meta() -> None:
    filas = [
        fila(0.6, fidelidad=0.95, precision=0.85),
        fila(0.7, fidelidad=0.93, precision=0.91),
        fila(0.8, fidelidad=0.93, precision=0.92),
    ]

    eleccion = elegir_umbral_entailment(filas, METAS, provisional=0.7)

    assert eleccion.valor == 0.8
    assert "0.60" in eleccion.justificacion and "precisión de citas" in eleccion.justificacion


def test_a_igual_fidelidad_prefiere_el_umbral_mas_alto() -> None:
    filas = [fila(0.8), fila(0.6), fila(0.7)]

    assert elegir_umbral_entailment(filas, METAS, provisional=0.7).valor == 0.8


def test_descarta_el_umbral_cuyo_sin_evidencia_esta_bajo_la_meta() -> None:
    filas = [fila(0.5, fidelidad=0.99, sin_evidencia=0.80), fila(0.7, fidelidad=0.90)]

    eleccion = elegir_umbral_entailment(filas, METAS, provisional=0.5)

    assert eleccion.valor == 0.7
    assert "sin evidencia" in eleccion.justificacion


def test_acepta_un_umbral_que_iguala_exactamente_las_metas() -> None:
    filas = [fila(0.7, precision=0.90, sin_evidencia=0.90)]

    assert not elegir_umbral_entailment(filas, METAS, provisional=0.5).sin_valor_elegible


def test_conserva_el_provisional_y_lo_marca_cuando_ningun_umbral_cumple_las_metas() -> None:
    filas = [fila(0.6, precision=0.85), fila(0.8, precision=0.88)]

    eleccion = elegir_umbral_entailment(filas, METAS, provisional=0.7)

    assert (eleccion.valor, eleccion.sin_valor_elegible) == (0.7, True)
    assert "sin valor elegible" in eleccion.justificacion


def test_trata_como_sin_medir_una_fila_con_una_metrica_ausente_en_vez_de_cero() -> None:
    filas = [fila(0.9, fidelidad=None), fila(0.7, fidelidad=0.90)]

    eleccion = elegir_umbral_entailment(filas, METAS, provisional=0.5)

    assert eleccion.valor == 0.7
    assert "0.90 sin medir" in eleccion.justificacion


def test_elegir_umbral_entailment_conserva_el_provisional_sin_filas() -> None:
    eleccion = elegir_umbral_entailment([], METAS, provisional=0.7)

    assert (eleccion.valor, eleccion.sin_valor_elegible) == (0.7, True)


def test_elige_el_menor_k_dentro_de_la_tolerancia_de_recall_del_mejor() -> None:
    filas = [fila(10, recall=0.74), fila(20, recall=0.81), fila(30, recall=0.82)]

    eleccion = elegir_top_k(filas, tolerancia_recall=0.02, provisional=30)

    assert (eleccion.valor, eleccion.sin_valor_elegible) == (20, False)


def test_un_k_justo_en_el_limite_de_la_tolerancia_cuenta_como_dentro() -> None:
    filas = [fila(10, recall=0.80), fila(20, recall=0.82)]

    assert elegir_top_k(filas, tolerancia_recall=0.02, provisional=20).valor == 10


def test_descarta_el_k_cuyo_p95_de_busqueda_supera_el_limite() -> None:
    filas = [
        fila(10, recall=0.81, p95_busqueda_ms=900.0),
        fila(20, recall=0.82, p95_busqueda_ms=400.0),
    ]

    eleccion = elegir_top_k(filas, tolerancia_recall=0.02, provisional=30, p95_maximo_ms=500.0)

    assert eleccion.valor == 20
    assert "p95" in eleccion.justificacion


def test_no_aplica_el_limite_de_p95_cuando_no_se_declara() -> None:
    filas = [fila(10, recall=0.82, p95_busqueda_ms=9000.0), fila(20, recall=0.82)]

    assert elegir_top_k(filas, tolerancia_recall=0.02, provisional=30).valor == 10


def test_elegir_top_k_conserva_el_provisional_y_lo_marca_cuando_ningun_k_cumple_el_p95() -> None:
    filas = [fila(10, p95_busqueda_ms=900.0)]

    eleccion = elegir_top_k(filas, 0.02, provisional=30, p95_maximo_ms=500.0)

    assert (eleccion.valor, eleccion.sin_valor_elegible) == (30, True)


def test_elegir_top_k_ignora_las_filas_sin_recall_medido() -> None:
    filas = [fila(10, recall=None), fila(20, recall=0.8)]

    eleccion = elegir_top_k(filas, tolerancia_recall=0.02, provisional=30)

    assert eleccion.valor == 20
    assert "10 sin medir" in eleccion.justificacion
