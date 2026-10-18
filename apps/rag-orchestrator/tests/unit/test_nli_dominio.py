"""Reglas puras del NLI: probabilidades por clase, etiqueta más probable e índices de clase (US-231b D2, RN-01, RN-22)."""

from __future__ import annotations

import pytest

from app.domain.nli import (
    ETIQUETAS_NLI,
    IndicesDeClase,
    IndicesDeClaseInvalidos,
    ProbabilidadesNli,
    calcular_probabilidades,
    dividir_premisa_en_ventanas,
    etiqueta_mas_probable,
    validar_indices_de_clase,
)

POR_DEFECTO = IndicesDeClase(entailment=0, neutral=1, contradiction=2)


def test_las_tres_probabilidades_suman_1_cuando_se_aplica_softmax_a_los_logits() -> None:
    p = calcular_probabilidades([2.0, -1.0, 0.5], POR_DEFECTO)

    assert p.entailment + p.neutral + p.contradiction == pytest.approx(1.0)
    assert p.entailment > p.contradiction > p.neutral


def test_cada_clase_toma_la_columna_de_los_indices_de_configuracion_y_no_la_posicion_cuando_el_mapeo_es_distinto() -> (
    None
):
    indices = IndicesDeClase(entailment=2, neutral=0, contradiction=1)

    p = calcular_probabilidades([0.0, 5.0, 9.0], indices)

    assert etiqueta_mas_probable(p) == "entailment"
    assert p.contradiction > p.neutral


def test_el_softmax_no_desborda_cuando_los_logits_son_enormes() -> None:
    p = calcular_probabilidades([1000.0, 0.0, -1000.0], POR_DEFECTO)

    assert p == ProbabilidadesNli(entailment=1.0, neutral=0.0, contradiction=0.0)


@pytest.mark.parametrize("logits", [[1.0, 2.0], [1.0, 2.0, 3.0, 4.0], []])
def test_calcular_probabilidades_rechaza_una_salida_que_no_tiene_tres_clases(
    logits: list[float],
) -> None:
    with pytest.raises(ValueError):
        calcular_probabilidades(logits, POR_DEFECTO)


@pytest.mark.parametrize("valor", [float("nan"), float("inf"), float("-inf")])
def test_calcular_probabilidades_rechaza_logits_no_finitos_en_vez_de_disfrazarlos(
    valor: float,
) -> None:
    with pytest.raises(ValueError):
        calcular_probabilidades([valor, 0.0, 0.0], POR_DEFECTO)


@pytest.mark.parametrize(
    ("p", "esperada"),
    [
        (ProbabilidadesNli(0.7, 0.2, 0.1), "entailment"),
        (ProbabilidadesNli(0.1, 0.7, 0.2), "neutral"),
        (ProbabilidadesNli(0.1, 0.2, 0.7), "contradiction"),
    ],
)
def test_la_etiqueta_es_la_clase_de_mayor_probabilidad(p: ProbabilidadesNli, esperada: str) -> None:
    assert etiqueta_mas_probable(p) == esperada


def test_un_empate_entre_entailment_y_contradiction_no_devuelve_entailment_porque_falla_cerrado() -> (
    None
):
    assert etiqueta_mas_probable(ProbabilidadesNli(0.4, 0.2, 0.4)) == "contradiction"
    assert etiqueta_mas_probable(ProbabilidadesNli(0.4, 0.4, 0.2)) == "neutral"
    assert etiqueta_mas_probable(ProbabilidadesNli(0.2, 0.4, 0.4)) == "contradiction"
    assert etiqueta_mas_probable(ProbabilidadesNli(1 / 3, 1 / 3, 1 / 3)) == "contradiction"
    assert set(ETIQUETAS_NLI) == {"entailment", "neutral", "contradiction"}


@pytest.mark.parametrize(
    "indices",
    [IndicesDeClase(0, 1, 2), IndicesDeClase(2, 0, 1), IndicesDeClase(1, 2, 0)],
)
def test_tres_indices_distintos_dentro_de_cero_a_dos_son_validos(indices: IndicesDeClase) -> None:
    assert validar_indices_de_clase(indices) is indices


@pytest.mark.parametrize(
    ("indices", "clase"),
    [
        (IndicesDeClase(0, 0, 2), "neutral"),
        (IndicesDeClase(1, 0, 1), "contradiction"),
        (IndicesDeClase(3, 1, 2), "entailment"),
        (IndicesDeClase(0, -1, 2), "neutral"),
        (IndicesDeClase(0, 1, 4711), "contradiction"),
    ],
)
def test_los_indices_repetidos_o_fuera_de_rango_nombran_la_clase_infractora_sin_su_valor(
    indices: IndicesDeClase, clase: str
) -> None:
    with pytest.raises(IndicesDeClaseInvalidos) as error:
        validar_indices_de_clase(indices)

    assert error.value.clase == clase
    assert str(error.value) == clase


def test_un_booleano_no_es_un_indice_de_clase() -> None:
    with pytest.raises(IndicesDeClaseInvalidos):
        validar_indices_de_clase(IndicesDeClase(True, 1, 2))  # type: ignore[arg-type]


def test_una_premisa_corta_es_una_sola_ventana() -> None:
    assert dividir_premisa_en_ventanas("uno dos tres", 10) == ["uno dos tres"]


def test_las_ventanas_cubren_la_premisa_entera_y_se_solapan() -> None:
    palabras = [f"p{i}" for i in range(20)]

    ventanas = dividir_premisa_en_ventanas(" ".join(palabras), 8)

    assert all(len(v.split()) <= 8 for v in ventanas)
    assert {p for v in ventanas for p in v.split()} == set(palabras)
    assert set(ventanas[0].split()) & set(ventanas[1].split())


def test_una_ventana_de_cero_palabras_es_invalida() -> None:
    with pytest.raises(ValueError):
        dividir_premisa_en_ventanas("uno dos", 0)
