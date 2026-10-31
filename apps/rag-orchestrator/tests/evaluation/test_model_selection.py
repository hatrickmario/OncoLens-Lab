from __future__ import annotations

import pytest

from app.evaluation.model_selection import (
    Medicion,
    MedicionVariante,
    Restricciones,
    dentro_de_tolerancia,
    descartar_por_restricciones,
    desempatar_por_memoria,
    seleccionar_componente,
    seleccionar_variante,
    verificar_presupuesto_conjunto,
)

RESTRICCIONES = Restricciones(
    stack_memory_limit_gb=24.0,
    llm_memory_budget_gb=16.0,
    stage_p95_budget_ms={"embeddings": 500.0, "reranker": 2000.0, "nli": 1500.0},
    academic_licenses=frozenset({"mit", "apache-2.0"}),
)


def medicion(
    nombre: str, *, memoria=2.0, p95=300.0, licencia="mit", metrica=0.8, etapa="embeddings"
) -> Medicion:
    return Medicion(nombre, etapa, memoria, p95, licencia, metrica)


@pytest.mark.ac("US-012", 2)
def test_descartar_por_restricciones_memoria_p95_o_licencia_descartan_aunque_la_metrica_sea_la_mejor_ac2() -> (
    None
):
    mediciones = [
        medicion("grande", memoria=9.0, metrica=0.99),
        medicion("lento", p95=900.0, metrica=0.98),
        medicion("nc", licencia="cc-by-nc-4.0", metrica=0.97),
        medicion("ok", metrica=0.70),
    ]

    seleccion = seleccionar_componente(mediciones, RESTRICCIONES, tolerancia_empate=0.0)

    assert seleccion.elegido is not None and seleccion.elegido.candidato == "ok"
    motivos = {d.candidato: (d.motivo, d.cifra) for d in seleccion.descartados}
    assert motivos["grande"][0] == "memoria" and "25.00 GB" in motivos["grande"][1]
    assert motivos["lento"][0] == "p95" and "900 ms" in motivos["lento"][1]
    assert motivos["nc"][0] == "licencia"


def test_descartar_por_restricciones_candidato_exactamente_en_el_limite_se_conserva() -> None:
    validos, descartados = descartar_por_restricciones(
        [medicion("justo", memoria=8.0, p95=500.0)], RESTRICCIONES
    )

    assert [m.candidato for m in validos] == ["justo"] and descartados == []


def test_descartar_por_restricciones_un_candidato_puede_acumular_varios_motivos() -> None:
    _, descartados = descartar_por_restricciones(
        [medicion("malo", memoria=9.0, p95=900.0, licencia="otra")], RESTRICCIONES
    )

    assert {d.motivo for d in descartados} == {"memoria", "p95", "licencia"}


@pytest.mark.ac("US-012", 4)
def test_desempatar_por_memoria_gana_el_de_menor_memoria_con_la_misma_metrica_ac4() -> None:
    seleccion = seleccionar_componente(
        [medicion("a", memoria=2.2, metrica=0.85), medicion("b", memoria=1.1, metrica=0.85)],
        RESTRICCIONES,
        tolerancia_empate=0.0,
    )

    assert seleccion.elegido is not None and seleccion.elegido.candidato == "b"
    assert seleccion.desempatado_por_memoria is True


def test_seleccionar_componente_diferencia_dentro_de_la_tolerancia_cuenta_como_empate() -> None:
    mediciones = [
        medicion("a", memoria=2.2, metrica=0.86),
        medicion("b", memoria=1.1, metrica=0.85),
    ]

    sin_tolerancia = seleccionar_componente(mediciones, RESTRICCIONES, tolerancia_empate=0.0)
    con_tolerancia = seleccionar_componente(mediciones, RESTRICCIONES, tolerancia_empate=0.02)

    assert sin_tolerancia.elegido.candidato == "a" and not sin_tolerancia.desempatado_por_memoria  # type: ignore[union-attr]
    assert con_tolerancia.elegido.candidato == "b" and con_tolerancia.desempatado_por_memoria  # type: ignore[union-attr]


@pytest.mark.parametrize(
    ("valor", "referencia", "esperado"),
    [
        (0.78, 0.80, True),
        (0.80, 0.80, True),
        (0.779, 0.80, False),
        (0.85, 0.86, True),
        (0.84, 0.86, True),
        (0.83, 0.86, False),
    ],
)
def test_dentro_de_tolerancia_incluye_el_borde_exacto_sin_error_de_coma_flotante(
    valor: float, referencia: float, esperado: bool
) -> None:
    assert dentro_de_tolerancia(valor, referencia, 0.02) is esperado


def test_seleccionar_componente_exige_la_tolerancia_de_empate_explicita() -> None:
    with pytest.raises(TypeError):
        seleccionar_componente([medicion("a")], RESTRICCIONES)  # type: ignore[call-arg]


def test_seleccionar_componente_empate_en_el_borde_exacto_de_la_tolerancia_decide_la_memoria() -> (
    None
):
    mediciones = [
        medicion("a", memoria=2.2, metrica=0.80),
        medicion("b", memoria=1.1, metrica=0.78),
    ]

    seleccion = seleccionar_componente(mediciones, RESTRICCIONES, tolerancia_empate=0.02)

    assert seleccion.elegido.candidato == "b" and seleccion.desempatado_por_memoria  # type: ignore[union-attr]


def test_desempatar_por_memoria_a_igual_memoria_decide_el_menor_p95() -> None:
    elegido = desempatar_por_memoria([medicion("a", p95=400.0), medicion("b", p95=200.0)])

    assert elegido.candidato == "b"


@pytest.mark.ac("US-012", 5)
def test_seleccionar_componente_sin_ningun_candidato_valido_devuelve_sin_candidato_ac5() -> None:
    seleccion = seleccionar_componente(
        [medicion("a", memoria=12.0), medicion("b", licencia="otra")],
        RESTRICCIONES,
        tolerancia_empate=0.0,
    )

    assert seleccion.sin_candidato is True
    assert {d.candidato for d in seleccion.descartados} == {"a", "b"}


def test_seleccionar_componente_con_lista_vacia_devuelve_sin_candidato() -> None:
    assert seleccionar_componente([], RESTRICCIONES, tolerancia_empate=0.0).sin_candidato is True


def test_verificar_presupuesto_conjunto_suma_los_tres_componentes_y_el_llm() -> None:
    cabe, total = verificar_presupuesto_conjunto(
        [medicion("e", memoria=2.5), medicion("r", memoria=3.0), medicion("n", memoria=1.0)],
        RESTRICCIONES,
    )
    no_cabe, total_grande = verificar_presupuesto_conjunto(
        [medicion("e", memoria=4.0), medicion("r", memoria=3.0), medicion("n", memoria=1.5)],
        RESTRICCIONES,
    )

    assert cabe is True and total == pytest.approx(22.5)
    assert no_cabe is False and total_grande == pytest.approx(24.5)


@pytest.mark.ac("US-012", 11)
def test_seleccionar_variante_gana_la_de_menos_chunks_si_la_mejora_no_supera_el_margen() -> None:
    variantes = [
        MedicionVariante("512", 0.80, 900, 0),
        MedicionVariante("256", 0.81, 1800, 0),
        MedicionVariante("1024", 0.79, 500, 0),
    ]

    assert seleccionar_variante(variantes, margen=0.02).variante == "1024"


def test_seleccionar_variante_gana_la_de_mayor_recall_si_supera_el_margen() -> None:
    variantes = [MedicionVariante("512", 0.80, 900, 0), MedicionVariante("256", 0.86, 1800, 0)]

    assert seleccionar_variante(variantes, margen=0.02).variante == "256"


def test_seleccionar_variante_con_mismo_recall_y_chunks_gana_la_mas_simple() -> None:
    variantes = [MedicionVariante("estructura", 0.8, 900, 1), MedicionVariante("fijo", 0.8, 900, 0)]

    assert seleccionar_variante(variantes, margen=0.02).variante == "fijo"
