"""Reglas puras de la familia `diagnostico` (US-276): etapa responsable, recuento, histograma y fragmento esperado.
Sin adaptadores ni E/S: datos de dominio construidos a mano."""

from __future__ import annotations

import pytest

from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.dataset_loader import Evidencia
from app.evaluation.fuente_dataset import ChunkCorpus
from app.evaluation.metricas.diagnostico import (
    AfirmacionJuzgada,
    AsignacionDePar,
    CandidatoObservado,
    LoopObservado,
    RedaccionObservada,
    afirmaciones_juzgadas,
    asignar_par,
    chunks_esperados_de,
    etapa_responsable,
    histograma_de_p_entailment,
    observar_chunk_esperado,
    recuento_de_causas_sin_asignar,
    recuento_en_banda,
    recuento_por_etapa,
)

UMBRAL = 0.3


def redaccion(**cambios: object) -> RedaccionObservada:
    """Una redacción que supera todas las etapas y termina sin evidencia por el soporte; cada test cambia lo suyo."""
    base: dict[str, object] = {
        "puesto_denso": 1,
        "entro_en_pares": True,
        "supero_umbral": True,
        "con_evidencia": False,
        "opciones_generadas": 1,
        "afirmaciones_al_nli": 1,
    }
    return RedaccionObservada(**{**base, **cambios})  # type: ignore[arg-type]


def candidatos(*ids: str) -> tuple[CandidatoObservado, ...]:
    """Candidatos con similitud descendente: el primero id es el más cercano."""
    return tuple(CandidatoObservado(c, 1.0 - 0.1 * i) for i, c in enumerate(ids))


# --- chunks_esperados_de ---------------------------------------------------------------------------------------------


def test_chunks_esperados_son_los_del_documento_esperado_cuyo_texto_contiene_la_cita_literal() -> (
    None
):
    chunks = [
        ChunkCorpus("c1", "d1", "El tratamiento con tamoxifeno disminuye el riesgo."),
        ChunkCorpus(
            "c2", "d2", "El tratamiento con tamoxifeno disminuye el riesgo."
        ),  # otro documento
        ChunkCorpus("c3", "d1", "Texto sin relacion."),
    ]

    esperados = chunks_esperados_de([Evidencia("d1", "tamoxifeno disminuye el riesgo")], chunks)

    assert esperados == ("c1",)


def test_chunks_esperados_es_vacio_cuando_ningun_chunk_contiene_la_cita() -> None:
    assert (
        chunks_esperados_de([Evidencia("d1", "cita ausente")], [ChunkCorpus("c1", "d1", "otro")])
        == ()
    )


# --- observar_chunk_esperado -----------------------------------------------------------------------------------------


def test_observacion_da_puesto_pares_puntaje_y_umbral_cuando_el_esperado_fue_puntuado() -> None:
    loop = LoopObservado(candidatos("x1", "e", "x2"), pares=("x1", "e"), puntajes=(0.1, 0.9))

    o = observar_chunk_esperado(("e",), loop, top_k=3, umbral=UMBRAL)

    assert (o.chunk_esperado, o.puesto_denso, o.entro_en_pares) == ("e", 2, True)
    assert (o.relevance_score, o.supero_umbral) == (0.9, True)


def test_observacion_deja_puntaje_y_umbral_en_none_cuando_el_esperado_queda_fuera_de_los_pares() -> (
    None
):
    loop = LoopObservado(candidatos("x1", "x2", "e"), pares=("x1", "x2"), puntajes=(0.1, 0.2))

    o = observar_chunk_esperado(("e",), loop, top_k=3, umbral=UMBRAL)

    assert (o.puesto_denso, o.entro_en_pares) == (3, False)
    assert (o.relevance_score, o.supero_umbral) == (None, None)


def test_observacion_deja_todo_en_none_cuando_el_esperado_supera_el_top_k_de_candidatos() -> None:
    loop = LoopObservado(candidatos("x1", "x2", "e"), pares=("x1", "x2"), puntajes=(0.1, 0.2))

    o = observar_chunk_esperado(("e",), loop, top_k=2, umbral=UMBRAL)

    assert o.chunk_esperado == "e"
    assert (o.puesto_denso, o.entro_en_pares, o.relevance_score, o.supero_umbral) == (None,) * 4


def test_observacion_elige_el_esperado_de_mejor_puesto_denso() -> None:
    loop = LoopObservado(
        candidatos("x1", "e2", "e1"), pares=("x1", "e2", "e1"), puntajes=(0.1, 0.5, 0.9)
    )

    o = observar_chunk_esperado(("e1", "e2"), loop, top_k=3, umbral=UMBRAL)

    assert (o.chunk_esperado, o.puesto_denso) == ("e2", 2)


def test_observacion_sin_loop_con_candidatos_deja_todo_en_none() -> None:
    assert observar_chunk_esperado(("e",), None, 3, UMBRAL).puesto_denso is None
    assert observar_chunk_esperado(("e",), LoopObservado(()), 3, UMBRAL).puesto_denso is None


def test_observacion_trata_el_umbral_como_estricto() -> None:
    loop = LoopObservado(candidatos("e"), pares=("e",), puntajes=(UMBRAL,))

    assert observar_chunk_esperado(("e",), loop, 1, UMBRAL).supero_umbral is False


def test_observacion_ordena_por_similitud_y_desempata_por_id() -> None:
    iguales = (CandidatoObservado("b", 0.5), CandidatoObservado("a", 0.5))
    loop = LoopObservado(iguales, pares=("a", "b"), puntajes=(0.9, 0.9))

    assert observar_chunk_esperado(("a",), loop, 2, UMBRAL).puesto_denso == 1


# --- etapa_responsable -----------------------------------------------------------------------------------------------


def test_etapa_es_recuperacion_densa_cuando_el_esperado_no_esta_entre_los_candidatos() -> None:
    a = etapa_responsable(redaccion(puesto_denso=None, entro_en_pares=None, supero_umbral=None))

    assert (a.resultado, a.etapa, a.causa) == ("perdida", "recuperacion_densa", None)


def test_etapa_es_corte_de_pares_cuando_es_candidato_y_queda_fuera_de_los_pares() -> None:
    a = etapa_responsable(redaccion(puesto_denso=7, entro_en_pares=False, supero_umbral=None))

    assert a.etapa == "corte_de_pares"


def test_etapa_es_umbral_cuando_fue_puntuado_bajo_el_umbral() -> None:
    assert etapa_responsable(redaccion(supero_umbral=False)).etapa == "umbral_de_relevancia"


def test_etapa_es_nli_cuando_supera_el_umbral_y_las_afirmaciones_no_pasan_el_soporte() -> None:
    a = etapa_responsable(redaccion())

    assert (a.resultado, a.etapa) == ("perdida", "nli")


def test_etapa_elige_la_primera_que_falla_en_el_orden_del_pipeline() -> None:
    a = etapa_responsable(redaccion(puesto_denso=None, entro_en_pares=False, supero_umbral=False))

    assert a.etapa == "recuperacion_densa"


@pytest.mark.parametrize("generadas", [0, None])
def test_sin_asignar_por_sin_opciones_generadas_cuando_supera_el_umbral_y_no_hubo_opciones(
    generadas: int | None,
) -> None:
    a = etapa_responsable(redaccion(opciones_generadas=generadas, afirmaciones_al_nli=None))

    assert (a.resultado, a.etapa, a.causa) == ("sin_asignar", None, "sin_opciones_generadas")


@pytest.mark.parametrize("al_nli", [0, None])
def test_sin_asignar_por_citas_cuando_hubo_opciones_y_ninguna_llego_al_nli(
    al_nli: int | None,
) -> None:
    a = etapa_responsable(redaccion(afirmaciones_al_nli=al_nli))

    assert (a.resultado, a.etapa, a.causa) == ("sin_asignar", None, "citas")


# --- asignar_par y recuento ------------------------------------------------------------------------------------------


def test_par_con_una_redaccion_con_evidencia_y_otra_sin_ella_asigna_la_etapa_de_la_que_pierde() -> (
    None
):
    sin = redaccion(supero_umbral=False)
    con = redaccion(con_evidencia=True)

    a = asignar_par("P1", [("a", con), ("b", sin)])

    assert (a.resultado, a.etapa, a.redaccion_perdida) == ("perdida", "umbral_de_relevancia", "b")


@pytest.mark.parametrize("con_evidencia", [True, False])
def test_par_con_las_dos_redacciones_iguales_no_tiene_perdida(con_evidencia: bool) -> None:
    r = redaccion(con_evidencia=con_evidencia)

    a = asignar_par("P1", [("a", r), ("b", r)])

    assert (a.resultado, a.etapa, a.causa, a.redaccion_perdida) == ("sin_perdida", None, None, None)


def test_par_con_dos_redacciones_sin_evidencia_de_tres_asigna_la_primera_en_el_orden_del_dataset() -> (
    None
):
    primera = redaccion(puesto_denso=None, entro_en_pares=None, supero_umbral=None)
    segunda = redaccion(supero_umbral=False)

    a = asignar_par("P1", [("a", redaccion(con_evidencia=True)), ("b", primera), ("c", segunda)])

    assert (a.etapa, a.redaccion_perdida) == ("recuperacion_densa", "b")


def test_recuento_por_etapa_suma_el_numero_de_pares_y_cuenta_aparte_sin_asignar_y_sin_perdida() -> (
    None
):
    asignaciones = [
        AsignacionDePar("P1", "perdida", "nli", None, "b"),
        AsignacionDePar("P2", "perdida", "nli", None, "b"),
        AsignacionDePar("P3", "sin_asignar", None, "citas", "b"),
        AsignacionDePar("P4", "sin_perdida", None, None, None),
    ]

    recuento = recuento_por_etapa(asignaciones)

    assert recuento == {
        "recuperacion_densa": 0,
        "corte_de_pares": 0,
        "umbral_de_relevancia": 0,
        "nli": 2,
        "sin_asignar": 1,
        "sin_perdida": 1,
    }
    assert sum(recuento.values()) == len(asignaciones)
    assert recuento_de_causas_sin_asignar(asignaciones) == {"sin_opciones_generadas": 0, "citas": 1}


# --- el NLI ----------------------------------------------------------------------------------------------------------


def test_una_afirmacion_con_varias_premisas_toma_la_p_entailment_maxima_y_se_soporta_si_alguna_la_soporta() -> (
    None
):
    pares = [ParNli("p1", "h1"), ParNli("p2", "h1"), ParNli("p1", "h2")]
    resultados = [
        ResultadoNli("neutral", 0.2),
        ResultadoNli("entailment", 0.9),
        ResultadoNli("neutral", 0.4),
    ]

    juzgadas = afirmaciones_juzgadas(pares, resultados, umbral=0.7)

    assert juzgadas == [AfirmacionJuzgada(0.9, True), AfirmacionJuzgada(0.4, False)]


def test_afirmaciones_juzgadas_rechaza_un_resultado_por_par_incompleto() -> None:
    with pytest.raises(ValueError, match="un resultado por par"):
        afirmaciones_juzgadas([ParNli("p", "h")], [], umbral=0.7)


def test_histograma_reparte_las_descartadas_por_tramo_y_la_suma_es_el_total() -> None:
    tramos = histograma_de_p_entailment([0.0, 0.05, 0.1, 0.55, 0.65, 1.0], ancho=0.1)

    assert [t.recuento for t in tramos] == [2, 1, 0, 0, 0, 1, 1, 0, 0, 1]
    assert (tramos[0].desde, tramos[0].hasta, tramos[-1].desde, tramos[-1].hasta) == (
        0.0,
        0.1,
        0.9,
        1.0,
    )
    assert sum(t.recuento for t in tramos) == 6


def test_histograma_sin_descartadas_tiene_todos_los_tramos_en_cero() -> None:
    assert [t.recuento for t in histograma_de_p_entailment([], ancho=0.25)] == [0, 0, 0, 0]


@pytest.mark.parametrize("ancho", [0.0, -0.1, 0.3, 1.5])
def test_histograma_rechaza_un_ancho_que_no_divide_el_intervalo(ancho: float) -> None:
    with pytest.raises(ValueError, match="ancho"):
        histograma_de_p_entailment([0.5], ancho=ancho)


def test_histograma_rechaza_una_probabilidad_fuera_de_rango() -> None:
    with pytest.raises(ValueError, match="entre 0 y 1|\\[0, 1\\]"):
        histograma_de_p_entailment([1.2], ancho=0.1)


def test_banda_cuenta_las_descartadas_desde_el_limite_inferior_hasta_el_umbral_sin_incluirlo() -> (
    None
):
    assert recuento_en_banda([0.49, 0.5, 0.6, 0.69, 0.7, 0.9], inferior=0.5, umbral=0.7) == 3
    assert recuento_en_banda([], inferior=0.5, umbral=0.7) == 0
