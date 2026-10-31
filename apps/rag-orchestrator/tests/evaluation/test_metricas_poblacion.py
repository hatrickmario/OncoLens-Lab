"""Métricas puras de la familia `poblacion` (L1D-299): del caso más simple al siguiente, sin adapters."""

from __future__ import annotations

from app.evaluation.metricas.poblacion import (
    CasoDeEstado,
    Fraccion,
    ParMedido,
    cobertura_por_criterio,
    concordancia_de_estados,
    cortes_por_longitud,
    precision_por_criterio,
    sin_evidencia_vs_baseline,
    tasa_cortes_del_bucle,
    tasa_duplicados,
    veredicto,
)


def _par(
    criterio: str, esperados: set[str], obtenidos: tuple[str, ...], doc: str = "d1"
) -> ParMedido:
    return ParMedido(doc, criterio, frozenset(esperados), obtenidos)


def test_fraccion_sin_total_es_none_y_no_cero() -> None:
    assert Fraccion(0, 0).valor is None
    assert Fraccion(1, 2).valor == 0.5


def test_precision_cuenta_los_obtenidos_que_el_dorado_espera() -> None:
    pares = [_par("her2", {"a", "b"}, ("a", "x"))]

    assert precision_por_criterio(pares) == {"her2": Fraccion(1, 2)}


def test_precision_acumula_los_pares_del_mismo_criterio() -> None:
    pares = [
        _par("her2", {"a"}, ("a",), "d1"),
        _par("her2", {"b"}, ("c",), "d2"),
    ]

    assert precision_por_criterio(pares)["her2"] == Fraccion(1, 2)


def test_precision_sin_obtenidos_no_es_cero_sino_sin_medir() -> None:
    assert precision_por_criterio([_par("her2", {"a"}, ())])["her2"].valor is None


def test_cobertura_cuenta_los_esperados_que_la_extraccion_guardo() -> None:
    pares = [_par("her2", {"a", "b"}, ("a", "x"))]

    assert cobertura_por_criterio(pares) == {"her2": Fraccion(1, 2)}


def test_cobertura_sin_esperados_queda_sin_medir() -> None:
    assert cobertura_por_criterio([_par("her2", set(), ("a",))])["her2"].valor is None


def test_duplicados_cuenta_los_valores_repetidos_dentro_de_un_par() -> None:
    pares = [_par("her2", {"a"}, ("a", "a", "b")), _par("ecog", {"z"}, ("z",))]

    assert tasa_duplicados(pares) == Fraccion(1, 4)


def test_cortes_por_longitud_nombra_documento_y_criterio_solo_de_las_tareas_cortadas() -> None:
    tareas = [("d1", "her2", "stop"), ("d1", "ecog", "length"), ("d2", "her2", "length")]

    assert cortes_por_longitud(tareas) == [("d1", "ecog"), ("d2", "her2")]


def test_cortes_por_longitud_cuenta_una_vez_la_tarea_cuyo_reintento_tambien_se_corta() -> None:
    tareas = [("d1", "her2", "length"), ("d1", "her2", "length")]

    assert cortes_por_longitud(tareas) == [("d1", "her2")]


def test_concordancia_cuenta_aciertos_por_estado_esperado() -> None:
    casos = [
        CasoDeEstado("a", "parcial", "parcial"),
        CasoDeEstado("b", "coincide", "parcial"),
        CasoDeEstado("c", "coincide", "coincide"),
    ]

    resultado = concordancia_de_estados(casos)

    assert resultado.total == Fraccion(2, 3)
    assert resultado.por_estado["coincide"] == Fraccion(1, 2)
    assert resultado.por_estado["parcial"] == Fraccion(1, 1)
    assert resultado.por_estado["no_coincide"] == Fraccion(0, 0)


def test_concordancia_cuenta_aparte_el_no_coincide_y_el_coincide_indebidos() -> None:
    casos = [
        CasoDeEstado("a", "desconocido", "no_coincide"),
        CasoDeEstado("b", "no_coincide", "no_coincide"),
        CasoDeEstado("c", "parcial", "coincide"),
        CasoDeEstado("d", "coincide", "coincide"),
    ]

    resultado = concordancia_de_estados(casos)

    assert (resultado.no_coincide_indebido, resultado.coincide_indebido) == (1, 1)


def test_sin_evidencia_baja_cuando_el_actual_es_menor_que_el_baseline() -> None:
    assert sin_evidencia_vs_baseline(0.9, 0.8, 0).baja is True
    assert sin_evidencia_vs_baseline(0.9, 0.9, 0).baja is False
    assert sin_evidencia_vs_baseline(0.9, 1.0, 0).violada is False


def test_sin_evidencia_se_viola_con_una_violacion_de_rn02() -> None:
    assert sin_evidencia_vs_baseline(1.0, 1.0, 1).violada is True


def test_sin_evidencia_no_medida_cuenta_como_baja() -> None:
    assert sin_evidencia_vs_baseline(1.0, None, 0).baja is True


def test_bucle_se_cierra_solo_con_tasa_cero_y_el_minimo_de_pares() -> None:
    assert tasa_cortes_del_bucle(20, 0, 20).out06 == "cerrada"
    assert tasa_cortes_del_bucle(25, 0, 20).out06 == "cerrada"
    assert tasa_cortes_del_bucle(19, 0, 20).out06 == "insuficiente"
    assert tasa_cortes_del_bucle(20, 1, 20).out06 == "abierta"
    assert tasa_cortes_del_bucle(20, 1, 20).tasa == 0.05
    assert tasa_cortes_del_bucle(0, 0, 20).tasa is None


def _veredicto(**cambios: object):  # type: ignore[no-untyped-def]
    base: dict[str, object] = {
        "cortes": 0,
        "sin_evidencia_violada": False,
        "revisor_completo": True,
        "pares_del_dorado": 30,
        "minimo_de_pares": 30,
        "marcas": ("en_meta", "en_meta"),
    }
    return veredicto(**{**base, **cambios})  # type: ignore[arg-type]


def test_veredicto_es_pass_cuando_todo_cumple_y_el_dorado_esta_revisado() -> None:
    assert _veredicto().resultado == "pass"


def test_veredicto_es_fail_con_una_invariante_violada_y_la_nombra() -> None:
    resultado = _veredicto(cortes=1, sin_evidencia_violada=True)

    assert resultado.resultado == "fail"
    assert resultado.invariantes_violadas == ("finish_reason_length", "sin_evidencia")


def test_veredicto_es_fail_con_una_marca_fuera_de_meta() -> None:
    assert _veredicto(marcas=("en_meta", "fuera_de_meta")).resultado == "fail"


def test_veredicto_nunca_es_pass_sin_revisor_ni_con_muestra_insuficiente() -> None:
    sin_revisor = _veredicto(revisor_completo=False)
    corto = _veredicto(pares_del_dorado=29)

    assert (sin_revisor.resultado, sin_revisor.causas) == ("no_concluyente", ("sin_revisor",))
    assert (corto.resultado, corto.causas) == ("no_concluyente", ("muestra_insuficiente",))


def test_veredicto_la_invariante_violada_gana_sobre_no_concluyente() -> None:
    assert _veredicto(revisor_completo=False, cortes=1).resultado == "fail"
