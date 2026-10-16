from __future__ import annotations

import math

import pytest
from app.evaluation.dataset_loader import Evidencia, Pregunta
from app.evaluation.retrieval_metrics import (
    ChunkRecuperado,
    agregar,
    contiene_cita,
    evaluar_pregunta,
    metrica,
    normalizar_texto,
)


def pregunta(id="Q1", modo="cualquiera", idioma="es", evidencia=(("D1", "la cita exacta"),), control_de=None, tipo="hecho"):
    ev = tuple(Evidencia(d, c) for d, c in evidencia)
    return Pregunta(
        id=id,
        idioma=idioma,
        cancer="mama",
        tipo=tipo,
        texto="¿?",
        modo_acierto=modo,
        documentos=tuple(sorted({d for d, _ in evidencia})),
        evidencia=ev,
        control_de=control_de,
    )


def chunk(doc="D1", texto="x", puntaje=0.5) -> ChunkRecuperado:
    return ChunkRecuperado(doc, texto, puntaje)


def test_normalizar_texto_colapsa_espacios_y_puntuacion() -> None:
    assert normalizar_texto("HR,  0.67;\n95% CI (0.48–0.93)") == "HR 0 67 95 CI 0 48 0 93"


def test_contiene_cita_ignora_puntuacion_y_saltos_de_linea_pero_no_mayusculas() -> None:
    assert contiene_cita("antes: La  cita,\nexacta. después", "La cita exacta")
    assert not contiene_cita("la cita exacta", "La cita exacta")


@pytest.mark.ac("US-012", 10)
def test_evaluar_pregunta_acierta_solo_con_chunk_del_documento_esperado_que_contiene_la_cita_ac10() -> None:
    q = pregunta()
    ranking = [
        chunk("D2", "aquí está la cita exacta"),  # documento equivocado
        chunk("D1", "texto sin la cita"),  # documento correcto sin cita
        chunk("D1", "con la cita exacta dentro"),  # acierto en posición 3
    ]

    resultado = evaluar_pregunta(q, ranking)

    assert resultado.recall == 1.0
    assert resultado.rr == pytest.approx(1 / 3)


def test_evaluar_pregunta_fuera_del_top_10_no_cuenta() -> None:
    ranking = [chunk("D1", "nada")] * 10 + [chunk("D1", "la cita exacta")]

    resultado = evaluar_pregunta(pregunta(), ranking)

    assert resultado.recall == 0.0 and resultado.rr == 0.0


def test_evaluar_pregunta_cobertura_documentos_mide_la_fraccion_de_documentos_cubiertos() -> None:
    q = pregunta(modo="cobertura_documentos", evidencia=(("D1", "cita uno"), ("D2", "cita dos"), ("D3", "cita tres")))
    ranking = [chunk("D2", "cita dos"), chunk("D1", "cita uno aquí")]

    resultado = evaluar_pregunta(q, ranking)

    assert resultado.recall == pytest.approx(2 / 3)
    assert resultado.rr == 1.0


@pytest.mark.ac("US-012", 13)
def test_evaluar_pregunta_sin_evidencia_no_cuenta_como_acierto_ni_fallo_y_reporta_el_puntaje_maximo_ac13() -> None:
    q = pregunta(modo="sin_evidencia", evidencia=())

    resultado = evaluar_pregunta(q, [chunk(puntaje=0.31), chunk(puntaje=0.62), chunk(puntaje=0.4)])

    assert resultado.recall is None and resultado.rr is None
    assert resultado.puntaje_maximo == pytest.approx(0.62)


def test_metrica_ignora_sin_evidencia_y_promedia_el_resto() -> None:
    resultados = [
        evaluar_pregunta(pregunta(id="a"), [chunk(texto="la cita exacta")]),
        evaluar_pregunta(pregunta(id="b"), [chunk(texto="nada"), chunk(texto="la cita exacta")]),
        evaluar_pregunta(pregunta(id="c"), [chunk(texto="nada")]),
        evaluar_pregunta(pregunta(id="n", modo="sin_evidencia", evidencia=()), [chunk(puntaje=0.9)]),
    ]

    m = metrica(resultados, semilla=7)

    assert m.n == 3
    assert m.recall_at_10 == pytest.approx(2 / 3)
    assert m.mrr == pytest.approx((1 + 0.5 + 0) / 3)


@pytest.mark.ac("US-012", 10)
def test_metrica_intervalo_bootstrap_es_reproducible_con_la_misma_semilla_ac10() -> None:
    resultados = [
        evaluar_pregunta(pregunta(id=str(i)), [chunk(texto="la cita exacta" if i % 3 else "nada")]) for i in range(30)
    ]

    a = metrica(resultados, semilla=42, repeticiones=5)
    b = metrica(resultados, semilla=42, repeticiones=5)
    c = metrica(resultados, semilla=43, repeticiones=5)

    assert a.recall_ic95 == b.recall_ic95
    assert a.recall_ic95[0] <= a.recall_at_10 <= a.recall_ic95[1]
    assert a.recall_ic95 != c.recall_ic95


def test_metrica_sin_preguntas_devuelve_nan_sin_romper() -> None:
    m = metrica([], semilla=1)

    assert m.n == 0 and math.isnan(m.recall_at_10) and math.isnan(m.recall_ic95[0])


@pytest.mark.ac("US-012", 13)
def test_agregar_desglosa_por_fuente_tipo_idioma_y_controles_y_separa_sin_evidencia_ac13() -> None:
    resultados = [
        evaluar_pregunta(pregunta(id="es1", tipo="valor"), [chunk(texto="la cita exacta")]),
        evaluar_pregunta(pregunta(id="es2", tipo="hecho", evidencia=(("D2", "otra"),)), [chunk("D2", "nada")]),
        evaluar_pregunta(pregunta(id="en1", idioma="en", control_de="es1"), [chunk(texto="la cita exacta")]),
        evaluar_pregunta(pregunta(id="na", modo="sin_evidencia", evidencia=()), [chunk(puntaje=0.2), chunk(puntaje=0.55)]),
    ]

    resumen = agregar(resultados, semilla=1, repeticiones=50)

    assert resumen["total"].n == 3  # type: ignore[attr-defined]
    assert resumen["es_a_en"].n == 2  # type: ignore[attr-defined]
    assert resumen["controles_en"].n == 1  # type: ignore[attr-defined]
    assert set(resumen["por_fuente"]) == {"D1", "D2"}  # type: ignore[arg-type]
    assert set(resumen["por_tipo"]) == {"valor", "hecho"}  # type: ignore[arg-type]
    assert resumen["sin_evidencia_puntaje_maximo"] == {"n": 1, "maximo": 0.55, "mediana": 0.55}
