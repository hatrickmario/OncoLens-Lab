import pytest

from app.domain.trace_id import es_trace_id_valido
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator


@pytest.mark.parametrize("valor", ["req_abcdef12", "req_" + "a" * 32, "req_ABC12345"])
def test_es_trace_id_valido_acepta_el_formato_del_contrato(valor):
    assert es_trace_id_valido(valor)


@pytest.mark.parametrize(
    "valor", ["", "req_corto", "req_" + "a" * 33, "abcdef12", "req_abc def1", "req_abcdef1\n", "req_ñandú123"]
)
def test_es_trace_id_valido_rechaza_lo_que_no_cumple_el_formato(valor):
    assert not es_trace_id_valido(valor)


def test_generador_uuid_produce_trace_ids_validos_y_distintos():
    generador = UuidTraceIdGenerator()

    primero, segundo = generador.nuevo(), generador.nuevo()

    assert es_trace_id_valido(primero)
    assert primero != segundo
