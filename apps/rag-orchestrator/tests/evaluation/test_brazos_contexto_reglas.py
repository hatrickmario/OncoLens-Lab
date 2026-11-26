"""Reglas puras de la comparación de las variantes de contexto del chunk (US-279 AC-5, l1d-337 tarea 2.2): sin E/S, sin azar sin semilla."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.contexto_del_chunk import VarianteDeContexto
from app.evaluation.brazos_contexto import (
    MOTIVO_NO_MEDIBLE,
    MOTIVO_P95_SOBRE_EL_TOPE,
    MOTIVO_SIN_MEJORA,
    diferencia_pareada,
    error_de_los_brazos,
    regla_de_adopcion,
)

NINGUNO = VarianteDeContexto.NINGUNO
DETERMINISTA = VarianteDeContexto.DETERMINISTA
LLM = VarianteDeContexto.LLM


# --- la declaración de los brazos ------------------------------------------------------------------------------------


def test_sin_ninguna_variante_declarada_no_es_una_comparacion_de_contexto() -> None:
    assert error_de_los_brazos([("A0", None), ("A1", None)]) is None


def test_los_tres_brazos_con_ninguno_primero_son_validos() -> None:
    assert error_de_los_brazos([("A0", NINGUNO), ("A0-d", DETERMINISTA), ("A0-llm", LLM)]) is None


@pytest.mark.parametrize(
    ("brazos", "clave"),
    [
        ([("A0", NINGUNO), ("A0-d", None)], "todos los brazos"),
        ([("A0", DETERMINISTA), ("A0-d", LLM)], "ninguno"),
        ([("A0", NINGUNO), ("A0-d", DETERMINISTA), ("A0-e", DETERMINISTA)], "misma variante"),
    ],
)
def test_una_declaracion_incompleta_o_repetida_se_rechaza_nombrando_la_clave(
    brazos: list[tuple[str, VarianteDeContexto | None]], clave: str
) -> None:
    mensaje = error_de_los_brazos(brazos)

    assert mensaje is not None and "CORPUS_CHUNK_CONTEXT" in mensaje and clave in mensaje


# --- la diferencia pareada --------------------------------------------------------------------------------------------


def test_la_diferencia_pareada_es_la_media_de_las_diferencias_por_pregunta() -> None:
    brazo = {"a": 1.0, "b": 1.0, "c": 0.0, "d": 1.0}
    referencia = {"a": 0.0, "b": 1.0, "c": 0.0, "d": 0.0}

    resultado = diferencia_pareada(brazo, referencia, semilla=7, repeticiones=200)

    assert resultado.diferencia == pytest.approx(0.5)
    assert resultado.inferior is not None and resultado.superior is not None
    assert resultado.inferior <= resultado.diferencia <= resultado.superior


def test_el_intervalo_pareado_es_reproducible_con_la_misma_semilla() -> None:
    brazo = {str(i): float(i % 2) for i in range(30)}
    referencia = {str(i): 0.0 for i in range(30)}

    primero = diferencia_pareada(brazo, referencia, semilla=11, repeticiones=300)

    assert primero == diferencia_pareada(brazo, referencia, semilla=11, repeticiones=300)


def test_solo_cuentan_las_preguntas_medidas_en_los_dos_brazos() -> None:
    brazo = {"a": 1.0, "b": None, "c": 1.0}
    referencia = {"a": 0.0, "b": 1.0, "d": 1.0}

    resultado = diferencia_pareada(brazo, referencia, semilla=1, repeticiones=100)

    assert resultado.diferencia == pytest.approx(1.0)


def test_sin_preguntas_pareadas_la_diferencia_y_el_intervalo_son_null_y_no_cero() -> None:
    resultado = diferencia_pareada({"a": None}, {"a": 1.0}, semilla=1, repeticiones=100)

    assert (resultado.diferencia, resultado.inferior, resultado.superior) == (None, None, None)


def test_una_diferencia_nula_con_intervalo_que_incluye_cero_no_es_mejora() -> None:
    brazo = {"a": 1.0, "b": 0.0}
    referencia = {"a": 0.0, "b": 1.0}

    resultado = diferencia_pareada(brazo, referencia, semilla=3, repeticiones=200)

    assert resultado.diferencia == 0.0
    assert resultado.inferior is not None and resultado.inferior <= 0.0 <= resultado.superior  # type: ignore[operator]


# --- la regla de adopcion ---------------------------------------------------------------------------------------------


def test_cumple_cuando_el_intervalo_excluye_cero_y_el_p95_no_supera_el_tope() -> None:
    regla = regla_de_adopcion(inferior=0.02, p95_consulta_s=18.0, tope_p95_s=20.0)

    assert (regla.mejora_fuera_del_ruido, regla.motivos) == (True, ())


def test_el_p95_igual_al_tope_cumple_porque_el_tope_es_un_maximo() -> None:
    assert (
        regla_de_adopcion(
            inferior=0.02, p95_consulta_s=20.0, tope_p95_s=20.0
        ).mejora_fuera_del_ruido
        is True
    )


@pytest.mark.parametrize("inferior", [0.0, -0.01])
def test_no_cumple_sin_mejora_cuando_el_intervalo_incluye_cero(inferior: float) -> None:
    regla = regla_de_adopcion(inferior=inferior, p95_consulta_s=10.0, tope_p95_s=20.0)

    assert (regla.mejora_fuera_del_ruido, regla.motivos) == (False, (MOTIVO_SIN_MEJORA,))


def test_no_cumple_cuando_el_p95_supera_el_tope_aunque_mejore() -> None:
    regla = regla_de_adopcion(inferior=0.05, p95_consulta_s=20.5, tope_p95_s=20.0)

    assert (regla.mejora_fuera_del_ruido, regla.motivos) == (False, (MOTIVO_P95_SOBRE_EL_TOPE,))


def test_acumula_los_dos_motivos_cuando_ninguna_condicion_se_cumple() -> None:
    regla = regla_de_adopcion(inferior=-0.1, p95_consulta_s=30.0, tope_p95_s=20.0)

    assert regla.motivos == (MOTIVO_SIN_MEJORA, MOTIVO_P95_SOBRE_EL_TOPE)


@pytest.mark.parametrize(("inferior", "p95"), [(None, 10.0), (0.05, None), (None, None)])
def test_sin_una_medicion_no_se_marca_ni_cumple_ni_no_cumple(
    inferior: float | None, p95: float | None
) -> None:
    regla = regla_de_adopcion(inferior=inferior, p95_consulta_s=p95, tope_p95_s=20.0)

    assert (regla.mejora_fuera_del_ruido, regla.motivos) == (None, (MOTIVO_NO_MEDIBLE,))


@pytest.mark.parametrize(("p95", "esperado"), [(20.0, False), (20.1, True), (None, None)])
def test_el_tope_de_latencia_es_el_mismo_para_la_viabilidad_y_la_regla_de_adopcion(
    p95: float | None, esperado: bool | None
) -> None:
    from app.evaluation.viabilidad_del_brazo import exceso_de_latencia, viabilidad_del_brazo

    assert exceso_de_latencia(p95, 20.0) is esperado
    regla = regla_de_adopcion(inferior=0.1, p95_consulta_s=p95, tope_p95_s=20.0)
    viabilidad = viabilidad_del_brazo(
        p95_consulta_s=p95, tope_p95_s=20.0, memoria_del_stack_gb=1.0, limite_memoria_gb=30.0
    )
    assert (MOTIVO_P95_SOBRE_EL_TOPE in regla.motivos) is bool(esperado)
    assert (viabilidad.estado == "no_viable") is bool(esperado)
