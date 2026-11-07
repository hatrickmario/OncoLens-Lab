"""Reglas puras de las contradicciones del chat (US-262, RN-08, AC-T3.2): sin I/O, sin adapters."""

from dataclasses import replace

import pytest

from app.domain.chat.contradicciones import (
    afirmaciones_que_resuelven_conflicto,
    bloques_de_conflicto,
    es_pregunta_de_contradicciones,
    hechos_con_marca_sin_contraparte,
    pares_en_conflicto,
)
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, PropuestaDelTurno, TipoDeBloque


def _hecho(ref, texto, dia, estado="verificado", conflicto_con=None):
    return HechoDelCaso(
        ref=ref,
        verbalizacion=texto,
        dia_relativo=dia,
        estado_de_revision=estado,
        conflicto_con=conflicto_con,
    )


IIA = _hecho("f1", "estadio IIA (TNM_8)", 0, conflicto_con="f6")
IIB = _hecho("f6", "estadio IIB (TNM_8)", 10, "requiere_revision", conflicto_con="f1")
LIBRE = _hecho("f2", "RE: positivo", 25)


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Hay contradicciones en el expediente?",
        "¿Se contradice algún dato del caso?",
        "¿Existe alguna inconsistencia?",
        "¿Hay discrepancias entre los documentos?",
        "¿Algún dato fue corregido?",
        "¿Hubo una corrección del HER2?",
        "HAY CONTRADICCIÓN ENTRE LOS ESTADIOS",
    ],
)
def test_es_pregunta_de_contradicciones_acepta_la_formulacion_cuando_nombra_un_termino_fijo(
    pregunta,
):
    assert es_pregunta_de_contradicciones(pregunta) is True


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Cuál es la situación actual de la paciente?",
        "¿Cuál es el estadio correcto de la paciente?",
        "¿Qué evidencia existe sobre terapia adyuvante?",
    ],
)
def test_es_pregunta_de_contradicciones_rechaza_la_formulacion_cuando_no_nombra_un_termino_fijo(
    pregunta,
):
    assert es_pregunta_de_contradicciones(pregunta) is False


def test_pares_en_conflicto_devuelve_el_par_una_sola_vez_ordenado_por_dia_cuando_ambos_lo_marcan():
    assert pares_en_conflicto((IIB, LIBRE, IIA)) == ((IIA, IIB),)


def test_pares_en_conflicto_devuelve_el_par_cuando_solo_una_de_las_dos_marcas_existe():
    solo_iib = replace(IIA, conflicto_con=None)

    assert pares_en_conflicto((solo_iib, IIB)) == ((solo_iib, IIB),)


def test_pares_en_conflicto_ignora_la_marca_cuando_la_contraparte_no_esta_entre_los_hechos():
    assert pares_en_conflicto((IIA, LIBRE)) == ()


def test_pares_en_conflicto_devuelve_vacio_cuando_ningun_hecho_esta_marcado():
    assert pares_en_conflicto((LIBRE,)) == ()


def test_pares_en_conflicto_pone_el_hecho_sin_fecha_al_final_cuando_un_dia_es_desconocido():
    sin_fecha = replace(IIA, dia_relativo=None)

    assert pares_en_conflicto((sin_fecha, IIB)) == ((IIB, sin_fecha),)


def test_bloques_de_conflicto_compone_la_etiqueta_los_dos_valores_y_sus_factrefs_cuando_hay_un_par():
    bloques = bloques_de_conflicto((IIB, LIBRE, IIA), "Por conciliar")

    assert bloques == (
        BloqueDelTurno(
            TipoDeBloque.conflicto,
            "Por conciliar: Estadio IIA (TNM_8), al momento del diagnóstico. "
            "Frente a: Estadio IIB (TNM_8), 10 días después del diagnóstico, requiere revisión.",
            ("f1", "f6"),
        ),
    )


def test_bloques_de_conflicto_no_repite_la_marca_de_conflicto_en_la_descripcion_de_cada_valor():
    (bloque,) = bloques_de_conflicto((IIA, IIB), "Por conciliar")

    assert "en conflicto con otro dato" not in bloque.texto


def test_bloques_de_conflicto_devuelve_un_bloque_por_par_en_orden_de_dia_cuando_hay_varios_pares():
    otro_a = _hecho("f3", "HER2: 2+", 30, conflicto_con="f4")
    otro_b = _hecho("f4", "HER2: 3+", 40, "requiere_revision", conflicto_con="f3")

    bloques = bloques_de_conflicto((otro_b, otro_a, IIB, IIA), "Por conciliar")

    assert [b.fact_refs for b in bloques] == [("f1", "f6"), ("f3", "f4")]


def test_bloques_de_conflicto_devuelve_vacio_cuando_no_hay_pares():
    assert bloques_de_conflicto((LIBRE,), "Por conciliar") == ()


def test_hechos_con_marca_sin_contraparte_devuelve_el_hecho_marcado_cuando_su_contraparte_no_esta():
    assert hechos_con_marca_sin_contraparte((IIA, LIBRE)) == (IIA,)


def test_hechos_con_marca_sin_contraparte_devuelve_vacio_cuando_el_par_esta_completo():
    assert hechos_con_marca_sin_contraparte((IIA, IIB, LIBRE)) == ()


def _afirmacion(*refs):
    return PropuestaDelTurno("texto", tuple(refs))


def test_afirmaciones_que_resuelven_conflicto_devuelve_la_que_cita_un_solo_valor_del_par():
    solo_iib = _afirmacion("f6")

    assert afirmaciones_que_resuelven_conflicto((solo_iib,), (IIA, IIB, LIBRE)) == (solo_iib,)


def test_afirmaciones_que_resuelven_conflicto_devuelve_la_que_cita_un_valor_del_par_y_otro_hecho():
    iib_y_libre = _afirmacion("f6", "f2")

    assert afirmaciones_que_resuelven_conflicto((iib_y_libre,), (IIA, IIB, LIBRE)) == (iib_y_libre,)


def test_afirmaciones_que_resuelven_conflicto_no_devuelve_la_que_cita_ambos_valores_del_par():
    assert afirmaciones_que_resuelven_conflicto((_afirmacion("f6", "f1"),), (IIA, IIB)) == ()


def test_afirmaciones_que_resuelven_conflicto_no_devuelve_la_que_cita_hechos_sin_conflicto():
    assert afirmaciones_que_resuelven_conflicto((_afirmacion("f2"),), (IIA, IIB, LIBRE)) == ()


def test_afirmaciones_que_resuelven_conflicto_no_devuelve_la_que_cita_un_hecho_marcado_sin_contraparte():
    assert afirmaciones_que_resuelven_conflicto((_afirmacion("f1"),), (IIA, LIBRE)) == ()


def test_afirmaciones_que_resuelven_conflicto_conserva_el_orden_de_las_afirmaciones():
    a, b, c = _afirmacion("f1"), _afirmacion("f2"), _afirmacion("f6")

    assert afirmaciones_que_resuelven_conflicto((a, b, c), (IIA, IIB, LIBRE)) == (a, c)
