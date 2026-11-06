"""Reglas puras de los enlaces del turno ``caso`` (US-260, RN-01, ADR-34): sin adapters."""

from app.domain.chat.enlaces_del_caso import (
    filtrar_afirmaciones_sin_enlace,
    ordenar_series_por_dia_relativo,
)
from app.domain.chat.turno import HechoDelCaso, PropuestaDelTurno


def _hecho(ref: str, dia: int | None, serie: str | None = None, texto: str = "") -> HechoDelCaso:
    return HechoDelCaso(ref, texto or f"verbalización {ref}", dia, "verificado", serie=serie)


def _propuesta(texto: str, *refs: str) -> PropuestaDelTurno:
    return PropuestaDelTurno(texto, tuple(refs))


def test_filtrar_separa_la_afirmacion_sin_factref_cuando_el_llm_no_enlaza_ningun_dato():
    enlazada, suelta = _propuesta("a", "f1"), _propuesta("b")

    con_enlace, sin_enlace = filtrar_afirmaciones_sin_enlace([enlazada, suelta], {"f1", "f2"})

    assert (con_enlace, sin_enlace) == ((enlazada,), (suelta,))


def test_filtrar_separa_la_afirmacion_cuando_alguno_de_sus_factrefs_no_es_del_turno():
    ajena = _propuesta("a", "f1", "f9")

    con_enlace, sin_enlace = filtrar_afirmaciones_sin_enlace([ajena], {"f1"})

    assert (con_enlace, sin_enlace) == ((), (ajena,))


def test_ordenar_deja_la_serie_en_orden_ascendente_cuando_el_llm_la_devuelve_desordenada():
    hechos = [_hecho("f1", 90, "psa"), _hecho("f2", 0, "psa"), _hecho("f3", 30, "psa")]
    propuestas = [_propuesta("a", "f1"), _propuesta("b", "f2"), _propuesta("c", "f3")]

    ordenadas = ordenar_series_por_dia_relativo(propuestas, hechos)

    assert [p.fact_refs for p in ordenadas] == [("f2",), ("f3",), ("f1",)]


def test_ordenar_conserva_el_lugar_de_lo_que_no_es_serie_cuando_hay_series_intercaladas():
    hechos = [_hecho("f1", 0), _hecho("f2", 90, "psa"), _hecho("f3", 30, "psa")]
    propuestas = [_propuesta("a", "f2"), _propuesta("dx", "f1"), _propuesta("c", "f3")]

    ordenadas = ordenar_series_por_dia_relativo(propuestas, hechos)

    assert [p.texto for p in ordenadas] == ["c", "dx", "a"]


def test_ordenar_pone_al_final_el_dato_sin_fecha_confiable_y_no_lo_trata_como_dia_cero():
    hechos = [_hecho("f1", None, "psa"), _hecho("f2", 0, "psa"), _hecho("f3", 5, "psa")]
    propuestas = [_propuesta("a", "f1"), _propuesta("b", "f2"), _propuesta("c", "f3")]

    ordenadas = ordenar_series_por_dia_relativo(propuestas, hechos)

    assert [p.fact_refs for p in ordenadas] == [("f2",), ("f3",), ("f1",)]


def test_ordenar_ordena_los_factrefs_de_una_afirmacion_por_dia_relativo():
    hechos = [_hecho("f1", 60), _hecho("f2", 10)]

    ordenadas = ordenar_series_por_dia_relativo([_propuesta("a", "f1", "f2")], hechos)

    assert ordenadas[0].fact_refs == ("f2", "f1")


def test_ordenar_no_mueve_las_afirmaciones_de_series_distintas_entre_si():
    hechos = [_hecho("f1", 50, "psa"), _hecho("f2", 10, "ca153")]
    propuestas = [_propuesta("a", "f1"), _propuesta("b", "f2")]

    ordenadas = ordenar_series_por_dia_relativo(propuestas, hechos)

    assert [p.texto for p in ordenadas] == ["a", "b"]
