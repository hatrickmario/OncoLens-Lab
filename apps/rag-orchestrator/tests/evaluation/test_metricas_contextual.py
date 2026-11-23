"""Reglas puras de la familia `contextual` (US-271 AC-9, L1D-329): la causa de una pregunta de sinónimos y los recuentos por clase."""

from __future__ import annotations

from app.evaluation.metricas.contextual import (
    CAUSA_BAJO_UMBRAL,
    CAUSA_TERMINO_AUSENTE,
    AdversariasDeCaso,
    CambioFrenteALaBase,
    CoberturaDeCaso,
    FilaContextual,
    RecuentoDeClase,
    adversarias_por_caso,
    causa_de_sinonimo,
    comparar_con_base,
    genericas_con_evidencia_por_caso,
    recuentos_por_clase,
)

FORMAS_DE_TILS = ("TILs", "linfocitos infiltrantes de tumor", "tumor-infiltrating lymphocytes")


def test_la_causa_es_none_cuando_la_pregunta_supera_el_umbral() -> None:
    assert causa_de_sinonimo(True, FORMAS_DE_TILS, ["texto sin el termino"]) is None


def test_la_causa_es_termino_ausente_cuando_ninguna_forma_aparece_en_el_corpus() -> None:
    assert (
        causa_de_sinonimo(False, FORMAS_DE_TILS, ["relleno sin relacion", "otro fragmento"])
        == CAUSA_TERMINO_AUSENTE
    )


def test_la_causa_es_termino_ausente_cuando_el_corpus_no_tiene_chunks() -> None:
    assert causa_de_sinonimo(False, FORMAS_DE_TILS, []) == CAUSA_TERMINO_AUSENTE


def test_la_causa_es_bajo_umbral_cuando_la_forma_canonica_aparece_en_un_chunk() -> None:
    assert (
        causa_de_sinonimo(False, FORMAS_DE_TILS, ["relleno", "los TILs se describen en mama"])
        == CAUSA_BAJO_UMBRAL
    )


def test_la_causa_es_bajo_umbral_cuando_solo_aparece_una_forma_sinonima_del_termino() -> None:
    assert (
        causa_de_sinonimo(False, FORMAS_DE_TILS, ["los tumor-infiltrating lymphocytes en mama"])
        == CAUSA_BAJO_UMBRAL
    )


def test_la_forma_se_busca_sin_distinguir_mayusculas_ni_tildes() -> None:
    assert (
        causa_de_sinonimo(False, ("Anticuerpo mónoclonal",), ["el ANTICUERPO MONOCLONAL descrito"])
        == CAUSA_BAJO_UMBRAL
    )


def test_la_forma_no_cuenta_cuando_solo_es_parte_de_otra_palabra() -> None:
    assert causa_de_sinonimo(False, ("TILs",), ["las utils de apoyo"]) == CAUSA_TERMINO_AUSENTE


def _fila(pregunta: str, clase: str, caso: str, estado: str) -> FilaContextual:
    con = estado == "con_evidencia"
    return FilaContextual(pregunta, clase, caso, estado, con, 0.9 if con else None, "ninguno")


def test_los_recuentos_dan_con_evidencia_y_denominador_por_clase_en_total_y_por_caso() -> None:
    filas = [
        _fila("G1", "generica", "mama", "con_evidencia"),
        _fila("G1", "generica", "prostata", "sin_evidencia"),
        _fila("A1", "con_tema", "mama", "sin_evidencia"),
        _fila("A1", "con_tema", "prostata", "con_evidencia"),
        _fila("C1", "control", "mama", "con_evidencia"),
        _fila("C1", "control", "prostata", "con_evidencia"),
    ]

    assert recuentos_por_clase(filas) == (
        RecuentoDeClase("total", "generica", 1, 2, 1),
        RecuentoDeClase("total", "con_tema", 1, 2, 1),
        RecuentoDeClase("total", "control", 2, 2, 2),
        RecuentoDeClase("mama", "generica", 1, 1, 1),
        RecuentoDeClase("mama", "con_tema", 0, 1, 0),
        RecuentoDeClase("mama", "control", 1, 1, 1),
        RecuentoDeClase("prostata", "generica", 0, 1, 0),
        RecuentoDeClase("prostata", "con_tema", 1, 1, 1),
        RecuentoDeClase("prostata", "control", 1, 1, 1),
    )


def test_los_recuentos_dejan_la_clase_sin_preguntas_con_total_cero_y_no_la_omiten() -> None:
    recuentos = recuentos_por_clase([_fila("G1", "generica", "mama", "sin_evidencia")])

    assert RecuentoDeClase("total", "control", 0, 0, 0) in recuentos
    assert len(recuentos) == 6


def test_una_salida_invalida_no_cuenta_como_con_evidencia_aunque_supere_el_umbral() -> None:
    fila = FilaContextual("G1", "generica", "mama", "salida_invalida", True, None, None)

    assert RecuentoDeClase("total", "generica", 0, 1, 1) in recuentos_por_clase([fila])


def _generica(caso: str, estado: str, campos: tuple[str, ...] = ()) -> FilaContextual:
    con = estado == "con_evidencia"
    return FilaContextual(
        "CTX-G", "generica", caso, estado, con, 0.9 if con else None, "contextual", (), campos
    )


def test_la_cobertura_cuenta_las_genericas_con_evidencia_del_servicio_y_cumple_cuando_alcanza_la_meta() -> (
    None
):
    filas = [
        _generica("a", "con_evidencia", ("tipo", "estadio")),
        _generica("a", "con_evidencia"),
        _generica("a", "sin_evidencia"),
    ]

    assert genericas_con_evidencia_por_caso(filas, 2) == (
        CoberturaDeCaso("a", 2, 3, 2, True, ("tipo", "estadio")),
    )


def test_la_cobertura_no_cumple_cuando_queda_por_debajo_de_la_meta_de_la_configuracion() -> None:
    filas = [_generica("a", "con_evidencia"), _generica("a", "sin_evidencia")]

    (cobertura,) = genericas_con_evidencia_por_caso(filas, 2)

    assert (cobertura.genericas_con_evidencia, cobertura.minimo, cobertura.cumple) == (1, 2, False)


def test_la_cobertura_da_un_registro_por_caso_en_orden_e_ignora_las_demas_clases() -> None:
    filas = [
        _generica("b", "sin_evidencia"),
        _fila("CTX-A01", "con_tema", "b", "con_evidencia"),
        _generica("a", "con_evidencia"),
    ]

    cobertura = genericas_con_evidencia_por_caso(filas, 1)

    assert [(c.caso, c.genericas_con_evidencia, c.genericas_total) for c in cobertura] == [
        ("b", 0, 1),
        ("a", 1, 1),
    ]


def test_la_cobertura_de_un_caso_sin_genericas_no_cumple_y_no_inventa_cifras() -> None:
    (cobertura,) = genericas_con_evidencia_por_caso(
        [_fila("CTX-C1", "control", "a", "con_evidencia")], 1
    )

    assert (cobertura.genericas_con_evidencia, cobertura.genericas_total, cobertura.cumple) == (
        0,
        0,
        False,
    )


def test_las_adversarias_cuentan_sin_evidencia_falsos_positivos_puntajes_null_y_llamadas_al_generador() -> (
    None
):
    filas = [
        _fila("CTX-A01", "con_tema", "a", "sin_evidencia"),
        FilaContextual(
            "CTX-A02", "con_tema", "a", "con_evidencia", True, 0.8, "ninguno", (), (), 1
        ),
        _generica("a", "con_evidencia"),
    ]

    assert adversarias_por_caso(filas) == (AdversariasDeCaso("a", 2, 1, 1, 1, 1),)


def _recuentos(ambito: str, genericas: int, controles: int, con_tema: int) -> list[RecuentoDeClase]:
    return [
        RecuentoDeClase(ambito, "generica", genericas, 22, genericas),
        RecuentoDeClase(ambito, "con_tema", con_tema, 24, con_tema),
        RecuentoDeClase(ambito, "control", controles, 14, controles),
    ]


def test_la_comparacion_senala_la_cobertura_que_baja_y_el_falso_positivo_que_sube() -> None:
    base = _recuentos("total", 20, 14, 0)
    actual = _recuentos("total", 18, 14, 1)

    cambios = {c.metrica: c for c in comparar_con_base(actual, base)}

    assert cambios["genericas_con_evidencia"] == CambioFrenteALaBase(
        "total", "genericas_con_evidencia", 20, 18, True
    )
    assert cambios["falsos_positivos"].empeora is True
    assert cambios["controles_con_evidencia"].empeora is False


def test_la_comparacion_no_senala_lo_que_mejora_ni_lo_que_queda_igual() -> None:
    base = _recuentos("total", 18, 13, 1)
    actual = _recuentos("total", 20, 14, 0)

    assert not [c for c in comparar_con_base(actual, base) if c.empeora]


def test_la_comparacion_solo_incluye_los_ambitos_que_estan_en_las_dos_corridas() -> None:
    base = _recuentos("total", 20, 14, 0) + _recuentos("a", 10, 14, 0)
    actual = _recuentos("total", 20, 14, 0) + _recuentos("b", 10, 14, 0)

    assert {c.ambito for c in comparar_con_base(actual, base)} == {"total"}


def test_el_falso_positivo_es_el_mismo_en_las_adversarias_y_en_la_comparacion_cuando_la_salida_del_generador_es_invalida() -> (
    None
):
    invalida = FilaContextual(
        "CTX-A01", "con_tema", "a", "salida_invalida", True, None, None, (), (), 1
    )
    base = _recuentos("a", 20, 14, 0)

    (adversarias,) = adversarias_por_caso([invalida])
    cambios = comparar_con_base(recuentos_por_clase([invalida]), base)

    superado = next(c for c in cambios if (c.ambito, c.metrica) == ("a", "falsos_positivos"))
    assert adversarias.falsos_positivos == 1
    assert (superado.actual, superado.empeora) == (1, True)
