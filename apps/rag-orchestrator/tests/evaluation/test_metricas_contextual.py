"""Reglas puras de la familia `contextual` (US-271 AC-9, L1D-329): la causa de una pregunta de sinónimos y los recuentos por clase."""

from __future__ import annotations

from app.evaluation.metricas.contextual import (
    CAUSA_BAJO_UMBRAL,
    CAUSA_TERMINO_AUSENTE,
    FilaContextual,
    RecuentoDeClase,
    causa_de_sinonimo,
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
        RecuentoDeClase("total", "generica", 1, 2),
        RecuentoDeClase("total", "con_tema", 1, 2),
        RecuentoDeClase("total", "control", 2, 2),
        RecuentoDeClase("mama", "generica", 1, 1),
        RecuentoDeClase("mama", "con_tema", 0, 1),
        RecuentoDeClase("mama", "control", 1, 1),
        RecuentoDeClase("prostata", "generica", 0, 1),
        RecuentoDeClase("prostata", "con_tema", 1, 1),
        RecuentoDeClase("prostata", "control", 1, 1),
    )


def test_los_recuentos_dejan_la_clase_sin_preguntas_con_total_cero_y_no_la_omiten() -> None:
    recuentos = recuentos_por_clase([_fila("G1", "generica", "mama", "sin_evidencia")])

    assert RecuentoDeClase("total", "control", 0, 0) in recuentos
    assert len(recuentos) == 6


def test_una_salida_invalida_no_cuenta_como_con_evidencia_aunque_supere_el_umbral() -> None:
    fila = FilaContextual("G1", "generica", "mama", "salida_invalida", True, None, None)

    assert RecuentoDeClase("total", "generica", 0, 1) in recuentos_por_clase([fila])
