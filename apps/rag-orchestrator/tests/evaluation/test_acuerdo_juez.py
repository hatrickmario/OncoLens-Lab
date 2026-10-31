"""Reglas puras del juez local y del acuerdo con el NLI (US-233a AC-5 y AC-6), sin red ni adapters."""

from __future__ import annotations

import asyncio

import pytest

from app.evaluation.acuerdo_juez import (
    SISTEMA,
    VeredictoDelJuez,
    acuerdo_con_el_nli,
    estado_de_la_fidelidad_del_juez,
    juzgar_afirmacion,
    kappa_de_cohen,
    marcar_fidelidad_no_concluyente,
    mensaje_de_usuario,
    parsear_veredicto,
    porcentaje_de_acuerdo,
)
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from tests.evaluation.test_fidelidad_juez import CONFIG

IDS = ("F1", "F2")


@pytest.mark.parametrize(
    ("contenido", "esperado"),
    [
        ('{"veredicto": "soportada", "cita": "F2"}', VeredictoDelJuez(True, True)),
        ('{"veredicto": "no_soportada", "cita": ""}', VeredictoDelJuez(False, True)),
        ('{"veredicto": "no_soportada"}', VeredictoDelJuez(False, True)),
        ('{"veredicto": "soportada", "cita": "F9"}', VeredictoDelJuez(False, False)),
        ('{"veredicto": "soportada"}', VeredictoDelJuez(False, False)),
        ('{"veredicto": "soportada", "cita": 1}', VeredictoDelJuez(False, False)),
        ('{"veredicto": "quizá", "cita": "F1"}', VeredictoDelJuez(False, False)),
        ('{"cita": "F1"}', VeredictoDelJuez(False, False)),
        ('["soportada"]', VeredictoDelJuez(False, False)),
        ("SOPORTADA", VeredictoDelJuez(False, False)),
        ("", VeredictoDelJuez(False, False)),
    ],
)
def test_parsear_veredicto_acepta_solo_la_forma_estricta_y_cuenta_el_resto_como_invalido(
    contenido: str, esperado: VeredictoDelJuez
) -> None:
    assert parsear_veredicto(contenido, IDS) == esperado


class CompletadorGuionado:
    def __init__(self, respuesta: str) -> None:
        self.respuesta = respuesta
        self.llamadas: list[tuple[str, str]] = []

    async def completar(self, sistema: str, usuario: str) -> str:
        self.llamadas.append((sistema, usuario))
        return self.respuesta


def test_juzgar_afirmacion_envia_la_rubrica_y_solo_la_afirmacion_con_sus_fragmentos() -> None:
    completador = CompletadorGuionado('{"veredicto": "soportada", "cita": "F1"}')

    veredicto = asyncio.run(
        juzgar_afirmacion("AFIRMACION", {"F1": "TEXTO UNO", "F2": "TEXTO DOS"}, completador)
    )

    assert veredicto == VeredictoDelJuez(True, True)
    assert completador.llamadas == [
        (SISTEMA, mensaje_de_usuario("AFIRMACION", {"F1": "TEXTO UNO", "F2": "TEXTO DOS"}))
    ]
    assert "F1: TEXTO UNO" in completador.llamadas[0][1]
    assert "F2: TEXTO DOS" in completador.llamadas[0][1]


def test_juzgar_afirmacion_no_llama_al_juez_ni_da_soporte_cuando_no_hay_fragmentos() -> None:
    completador = CompletadorGuionado('{"veredicto": "soportada", "cita": "F1"}')

    veredicto = asyncio.run(juzgar_afirmacion("AFIRMACION", {}, completador))

    assert (veredicto, completador.llamadas) == (VeredictoDelJuez(False, True), [])


def test_la_rubrica_trae_los_tres_ejemplos_y_ningun_termino_prescriptivo() -> None:
    assert SISTEMA.count("Ejemplo ") == 3
    for prohibido in ("recomendad", "debe recibir", "se recomienda"):
        assert prohibido not in SISTEMA.lower()


def test_porcentaje_de_acuerdo_cuenta_las_coincidencias_y_es_none_sin_muestra() -> None:
    assert porcentaje_de_acuerdo([True, True, False, False], [True, False, False, True]) == 0.5
    assert porcentaje_de_acuerdo([True], [True]) == 1.0
    assert porcentaje_de_acuerdo([], []) is None


def test_los_acuerdos_rechazan_muestras_de_distinto_tamano() -> None:
    with pytest.raises(ValueError, match="mismas afirmaciones"):
        porcentaje_de_acuerdo([True], [True, False])
    with pytest.raises(ValueError, match="mismas afirmaciones"):
        kappa_de_cohen([True, False], [True])


@pytest.mark.parametrize(
    ("a", "b", "esperado"),
    [
        ([True, True, False, False], [True, True, False, False], 1.0),
        ([True, True, False, False], [False, False, True, True], -1.0),
        ([True, True, True, False], [True, True, True, True], 0.0),
        ([True, True, False, False], [True, False, False, True], 0.0),
        ([True, True, True, False, False], [True, True, False, False, False], 0.6153846153846154),
    ],
)
def test_kappa_de_cohen_corrige_el_acuerdo_por_azar(
    a: list[bool], b: list[bool], esperado: float
) -> None:
    assert kappa_de_cohen(a, b) == pytest.approx(esperado)


def test_kappa_de_cohen_es_none_y_no_cero_sin_muestra_o_con_una_sola_clase_en_ambos() -> None:
    assert kappa_de_cohen([], []) is None
    assert kappa_de_cohen([True, True], [True, True]) is None


@pytest.mark.parametrize(
    ("porcentaje", "marcado"),
    [(0.79, True), (0.80, False), (0.95, False), (None, True)],
)
def test_marcar_fidelidad_no_concluyente_bajo_el_minimo_o_sin_acuerdo_medible(
    porcentaje: float | None, marcado: bool
) -> None:
    assert marcar_fidelidad_no_concluyente(porcentaje, 0.8, 10, 1) is marcado


def test_el_estado_de_la_fidelidad_del_juez_nombra_la_marca() -> None:
    assert estado_de_la_fidelidad_del_juez(0.5, 0.8, 10, 1) == "no_concluyente"
    assert estado_de_la_fidelidad_del_juez(0.8, 0.8, 10, 1) == "concluyente"


def test_acuerdo_con_el_nli_lista_las_discrepancias_por_id_de_afirmacion() -> None:
    acuerdo = acuerdo_con_el_nli(
        ["q1/a1", "q1/a2", "q2/a1", "q2/a2"],
        [True, True, False, False],
        [True, False, False, True],
    )

    assert acuerdo == {
        "muestra": 4,
        "porcentaje": 0.5,
        "kappa": pytest.approx(0.0),
        "discrepancias": ["q1/a2", "q2/a2"],
    }


def test_acuerdo_con_el_nli_sin_afirmaciones_es_none_y_no_cero() -> None:
    assert acuerdo_con_el_nli([], [], []) == {
        "muestra": 0,
        "porcentaje": None,
        "kappa": None,
        "discrepancias": [],
    }


def test_acuerdo_con_el_nli_rechaza_ids_que_no_cubren_la_muestra() -> None:
    with pytest.raises(ValueError, match="mismas afirmaciones"):
        acuerdo_con_el_nli(["q1/a1"], [True, False], [True, False])


def test_el_acuerdo_minimo_del_juez_es_obligatorio_y_viene_de_la_configuracion() -> None:
    entorno = {"EVAL_JUDGE_MODEL": "m@1", "EVAL_JUDGE_BASE_URL": "http://127.0.0.1:11434/v1"}

    with pytest.raises(ConfigInvalida, match="acuerdo_minimo"):
        cargar_config_suite(CONFIG, entorno)
    config = cargar_config_suite(
        CONFIG, {**entorno, "JUEZ_ACUERDO_MINIMO": "0.7", "JUEZ_MUESTRA_MINIMA": "5"}
    )

    assert config.juez is not None and config.juez.acuerdo_minimo == 0.7


@pytest.mark.parametrize("valor", ["1.5", "-0.1", "abc"])
def test_el_acuerdo_minimo_fuera_de_cero_a_uno_o_ilegible_se_rechaza(valor: str) -> None:
    entorno = {
        "EVAL_JUDGE_MODEL": "m@1",
        "EVAL_JUDGE_BASE_URL": "http://127.0.0.1:11434/v1",
        "JUEZ_ACUERDO_MINIMO": valor,
        "JUEZ_MUESTRA_MINIMA": "5",
    }

    with pytest.raises(ConfigInvalida, match="acuerdo_minimo"):
        cargar_config_suite(CONFIG, entorno)
