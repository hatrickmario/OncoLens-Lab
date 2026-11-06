"""Periodo de la pregunta del chat (US-261 AC-3, RN-11): reglas puras sobre días relativos, sin fechas absolutas."""

import pytest

from app.domain.chat.periodo_de_la_pregunta import (
    MARCA_INICIADO_ANTES_DEL_PERIODO,
    filtrar_hechos_por_periodo,
    periodo_de_la_pregunta,
)
from app.domain.chat.turno import HechoDelCaso


@pytest.mark.parametrize(
    ("pregunta", "dias"),
    [
        ("¿Qué ocurrió en los últimos 100 días?", 100),
        ("¿Qué ocurrió en los ultimos 100 dias?", 100),
        ("¿Qué pasó en las últimas 2 semanas?", 14),
        ("¿Qué pasó en los últimos 3 meses?", 90),
        ("¿Qué pasó en los últimos 2 años?", 730),
        ("¿Qué pasó en los últimos tres meses?", 90),
        ("¿Qué pasó en las últimas doce semanas?", 84),
        ("¿Qué pasó en el último mes?", 30),
        ("¿Qué pasó en el último año?", 365),
        ("¿Qué pasó en la última semana?", 7),
        ("¿Qué pasó en los ÚLTIMOS 10 DÍAS?", 10),
    ],
)
def test_periodo_de_la_pregunta_convierte_el_periodo_a_dias_cuando_la_pregunta_lo_nombra(
    pregunta, dias
):
    assert periodo_de_la_pregunta(pregunta) == dias


@pytest.mark.parametrize(
    "pregunta",
    [
        "¿Cuál es la situación actual de la paciente?",
        "¿Qué ocurrió desde marzo de 2025?",
        "¿Qué ocurrió en los últimos días?",
        "¿Qué ocurrió en los últimos 0 días?",
        "¿Qué ocurrió en los últimos trece meses?",
        "",
    ],
)
def test_periodo_de_la_pregunta_devuelve_none_cuando_la_pregunta_no_nombra_un_periodo_reconocido(
    pregunta,
):
    assert periodo_de_la_pregunta(pregunta) is None


def _hecho(ref: str, dia: int | None, fin: int | None = None, texto: str = "Hecho") -> HechoDelCaso:
    return HechoDelCaso(ref, texto, dia, "verificado", dia_relativo_fin=fin)


def test_filtrar_hechos_por_periodo_conserva_el_hecho_puntual_cuando_su_dia_esta_dentro_del_periodo():
    hechos = (_hecho("f1", -100), _hecho("f2", -40), _hecho("f3", 0), _hecho("f4", 15))

    assert [h.ref for h in filtrar_hechos_por_periodo(hechos, 100)] == ["f1", "f2", "f3", "f4"]


def test_filtrar_hechos_por_periodo_descarta_el_hecho_puntual_cuando_su_dia_es_anterior_al_periodo():
    hechos = (_hecho("f1", -101), _hecho("f2", -160), _hecho("f3", -40))

    assert [h.ref for h in filtrar_hechos_por_periodo(hechos, 100)] == ["f3"]


def test_filtrar_hechos_por_periodo_descarta_el_hecho_sin_fecha_confiable_cuando_hay_periodo():
    hechos = (_hecho("f1", None), _hecho("f2", -10))

    assert [h.ref for h in filtrar_hechos_por_periodo(hechos, 100)] == ["f2"]


def test_filtrar_hechos_por_periodo_descarta_el_intervalo_que_termino_antes_del_periodo():
    hechos = (_hecho("f1", -300, -200),)

    assert filtrar_hechos_por_periodo(hechos, 100) == ()


def test_filtrar_hechos_por_periodo_marca_el_intervalo_que_empezo_antes_y_termino_dentro_del_periodo():
    hechos = (_hecho("f1", -160, -60, "quimioterapia neoadyuvante, línea 1"),)

    (conservado,) = filtrar_hechos_por_periodo(hechos, 100)

    assert conservado.ref == "f1"
    assert conservado.verbalizacion == (
        f"quimioterapia neoadyuvante, línea 1 {MARCA_INICIADO_ANTES_DEL_PERIODO}"
    )
    assert (conservado.dia_relativo, conservado.dia_relativo_fin) == (-160, -60)


def test_filtrar_hechos_por_periodo_no_marca_el_intervalo_que_empezo_dentro_del_periodo():
    hechos = (_hecho("f1", -50, -10, "Tratamiento"),)

    (conservado,) = filtrar_hechos_por_periodo(hechos, 100)

    assert conservado.verbalizacion == "Tratamiento"
