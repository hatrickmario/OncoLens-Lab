"""Reglas puras de la memoria y del soporte del chat (US-259, RN-24, RN-04): sin adapters."""

import pytest

from app.domain.chat.estado import (
    MAX_TURNOS_EN_MEMORIA,
    EstadoDelHilo,
    TurnoPrevio,
    estado_tras_el_turno,
)
from app.domain.chat.memoria import texto_de_turno, ventana_de_memoria
from app.domain.chat.soporte import afirmacion_tiene_soporte_del_turno


def _turno(numero: int, palabras: int = 5) -> TurnoPrevio:
    return TurnoPrevio(f"p{numero}", "caso", (" ".join(["x"] * palabras),), ("f1",))


def _por_palabras(texto: str) -> int:
    return len(texto.split())


def test_ventana_devuelve_los_ultimos_turnos_en_orden_cuando_todos_caben():
    turnos = [_turno(n) for n in range(3)]

    assert ventana_de_memoria(turnos, 1000, _por_palabras) == tuple(turnos)


def test_ventana_corta_en_el_primer_turno_que_no_cabe_cuando_se_supera_el_presupuesto():
    turnos = [_turno(n) for n in range(5)]
    costo = _por_palabras(texto_de_turno(turnos[0]))

    ventana = ventana_de_memoria(turnos, costo * 2 + 1, _por_palabras)

    assert ventana == (turnos[3], turnos[4])


def test_ventana_no_salta_un_turno_para_meter_uno_mas_antiguo_cuando_el_del_medio_no_cabe():
    turnos = [_turno(1), _turno(2, palabras=200), _turno(3)]

    assert ventana_de_memoria(turnos, 40, _por_palabras) == (turnos[2],)


def test_ventana_es_vacia_cuando_ni_el_ultimo_turno_cabe_o_no_hay_turnos():
    assert ventana_de_memoria([_turno(1, palabras=500)], 10, _por_palabras) == ()
    assert ventana_de_memoria([], 10, _por_palabras) == ()


@pytest.mark.parametrize(
    ("fact_refs", "chunks", "esperado"),
    [
        (("f1",), (), True),
        (("f1", "f2"), (), True),
        ((), (), False),  # sin referencia: solo la memoria la sostendría
        (("f9",), (), False),  # una referencia que no es de este turno
        (("f1", "f9"), (), False),
        ((), ("c1",), True),
        (("f1",), ("c9",), False),
    ],
)
def test_afirmacion_tiene_soporte_del_turno_solo_cuando_todo_lo_que_cita_es_de_este_turno(
    fact_refs, chunks, esperado
):
    assert afirmacion_tiene_soporte_del_turno(fact_refs, chunks, {"f1", "f2"}, {"c1"}) is esperado


def test_estado_tras_el_turno_registra_la_intencion_una_vez_y_acumula_las_preguntas():
    estado = estado_tras_el_turno(EstadoDelHilo(), _turno(1))
    estado = estado_tras_el_turno(estado, _turno(2))

    assert estado.estructurado.intents_vistos == ("caso",)
    assert estado.estructurado.preguntas_previas == ("p1", "p2")
    assert len(estado.turnos) == 2


def test_estado_tras_el_turno_acota_los_turnos_conservados_cuando_el_hilo_es_largo():
    estado = EstadoDelHilo()
    for numero in range(MAX_TURNOS_EN_MEMORIA + 5):
        estado = estado_tras_el_turno(estado, _turno(numero))

    assert len(estado.turnos) == MAX_TURNOS_EN_MEMORIA
    assert estado.turnos[-1].pregunta == f"p{MAX_TURNOS_EN_MEMORIA + 4}"
