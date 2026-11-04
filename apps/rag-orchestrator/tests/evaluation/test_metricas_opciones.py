"""Unitarios de las métricas de la familia `opciones` (US-140): M-10.1, M-10.2, orden, esperadas y retroceso de M-07.2."""

from __future__ import annotations

from app.evaluation.metricas import opciones_mostradas as medidas
from app.evaluation.metricas.opciones_mostradas import (
    AnalisisDeOpciones,
    OpcionMostrada,
    retrocesos_frente_a_la_referencia,
    violaciones_de,
)
from app.evaluation.metricas.orden_opciones import OpcionOrdenable


def opcion(
    identificador: str = "o1",
    *,
    documentos: tuple[str, ...] = ("doc-a1",),
    cita: bool = True,
    soporte: bool = True,
    excluyentes: int = 0,
    coincide: int = 2,
    no_comparable: bool = False,
) -> OpcionMostrada:
    return OpcionMostrada(
        identificador,
        documentos,
        cita,
        soporte,
        OpcionOrdenable(identificador, excluyentes, coincide, 0.5, no_comparable),
    )


def analisis(
    *opciones: OpcionMostrada,
    caso: str = "OP-01",
    esperadas: tuple[str, ...] = ("doc-a1",),
    espera_no_comparable: bool = False,
    nivel_a: int = 0,
    nivel_b: int = 0,
    campos: tuple[tuple[str, str], ...] = (),
) -> AnalisisDeOpciones:
    return AnalisisDeOpciones(
        caso, False, opciones, esperadas, espera_no_comparable, nivel_a, nivel_b, campos
    )


def test_m_10_1_es_none_cuando_no_se_mostro_ninguna_opcion() -> None:
    """``null`` ≠ ``0.0``: sin opciones mostradas la métrica no se mide."""
    assert medidas.m_10_1([analisis()])["porcentaje"] is None


def test_m_10_1_cuenta_solo_las_opciones_con_cita_a_un_chunk_entregado_y_soporte() -> None:
    casos = [analisis(opcion("o1"), opcion("o2", cita=False), opcion("o3", soporte=False))]

    assert medidas.m_10_1(casos) == {
        "mostradas": 3,
        "con_cita_y_soporte": 1,
        "porcentaje": 1 / 3,
    }


def test_m_10_2_suma_los_campos_por_nivel_de_todos_los_analisis() -> None:
    casos = [analisis(nivel_a=1), analisis(nivel_a=2, nivel_b=1)]

    assert medidas.m_10_2(casos) == {"nivel_a": 3, "nivel_b": 1, "campos_con_termino": 4}


def test_violaciones_de_es_vacio_cuando_se_cumplen_las_tres_invariantes() -> None:
    assert violaciones_de(analisis(opcion("o1"), opcion("o2"))) == ()


def test_violaciones_de_nombra_la_regla_y_el_campo_sin_texto_cuando_hay_un_termino() -> None:
    (violacion,) = violaciones_de(analisis(opcion(), nivel_b=1, campos=(("details", "B-03"),)))

    assert (violacion.invariante, violacion.caso, violacion.detalle) == (
        "M-10.2",
        "OP-01",
        "details:B-03",
    )


def test_violaciones_de_separa_el_orden_de_rn28_de_la_no_comparable_antes_de_una_comparable() -> (
    None
):
    casos = analisis(
        opcion("o1", no_comparable=True, excluyentes=0, coincide=3),
        opcion("o2", excluyentes=0, coincide=1),
    )

    assert [v.invariante for v in violaciones_de(casos)] == ["RN-28-no-comparable"]


def test_media_de_opciones_es_el_promedio_por_analisis() -> None:
    casos = [analisis(opcion("o1")), analisis(opcion("o1"), opcion("o2"), opcion("o3"))]

    assert medidas.media_de_opciones(casos) == {"analisis": 2, "media": 2.0}


def test_no_comparable_cuenta_no_mostrada_cuando_el_caso_la_espera_y_no_se_muestra() -> None:
    casos = [analisis(opcion("o1"), espera_no_comparable=True)]

    assert medidas.no_comparable(casos) == {"casos": 1, "mostrada_al_final": 0, "no_mostrada": 1}


def test_no_comparable_cuenta_mostrada_al_final_cuando_la_no_comparable_es_la_ultima() -> None:
    casos = [analisis(opcion("o1"), opcion("o2", no_comparable=True), espera_no_comparable=True)]

    assert medidas.no_comparable(casos) == {"casos": 1, "mostrada_al_final": 1, "no_mostrada": 0}


def test_esperadas_presentes_cuenta_las_fuentes_citadas_por_alguna_opcion_mostrada() -> None:
    casos = [analisis(opcion(documentos=("doc-a1",)), esperadas=("doc-a1", "doc-a3"))]

    assert medidas.esperadas_presentes(casos) == {
        "esperadas": 2,
        "presentes": 1,
        "porcentaje": 0.5,
    }


def test_retrocesos_es_vacio_cuando_la_metrica_empeora_exactamente_la_tolerancia() -> None:
    """0,80 - 0,75 vale 0,05000000000000004 en coma flotante: la tolerancia exacta no bloquea."""
    assert retrocesos_frente_a_la_referencia({"fidelidad": 0.75}, {"fidelidad": 0.80}, 0.05) == ()


def test_retrocesos_nombra_la_metrica_cuando_empeora_mas_que_la_tolerancia() -> None:
    (retroceso,) = retrocesos_frente_a_la_referencia({"fidelidad": 0.7}, {"fidelidad": 0.8}, 0.05)

    assert (retroceso.metrica, retroceso.valor, retroceso.referencia, retroceso.tolerancia) == (
        "fidelidad",
        0.7,
        0.8,
        0.05,
    )


def test_retrocesos_cuenta_una_metrica_sin_valor_como_retroceso_frente_a_una_referencia_con_valor() -> (
    None
):
    assert (
        len(retrocesos_frente_a_la_referencia({"fidelidad": None}, {"fidelidad": 0.8}, 0.05)) == 1
    )


def test_retrocesos_es_vacio_cuando_la_metrica_mejora() -> None:
    assert retrocesos_frente_a_la_referencia({"fidelidad": 0.95}, {"fidelidad": 0.8}, 0.05) == ()
