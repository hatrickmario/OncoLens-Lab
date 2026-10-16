import pytest
from starlette.requests import Request

from app.api.trace import resolver_trace_id
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator

NUEVO = "req_generado1"


class _GeneradorFijo:
    def nuevo(self) -> str:
        return NUEVO


def _peticion_con(valor: str | None) -> Request:
    cabeceras = [] if valor is None else [(b"x-trace-id", valor.encode("latin-1"))]
    return Request({"type": "http", "headers": cabeceras})


@pytest.mark.parametrize("valor", ["req_abcdef12", "req_" + "a" * 32, "req_ABC12345"])
def test_resolver_trace_id_conserva_el_recibido_cuando_cumple_el_formato_del_contrato(valor):
    assert resolver_trace_id(_peticion_con(valor), _GeneradorFijo()) == valor


@pytest.mark.parametrize(
    "valor", ["", "req_corto", "req_" + "a" * 33, "abcdef12", "req_abc def1", "req_abcdef1\n", "req_ñandú123"]
)
def test_resolver_trace_id_genera_uno_nuevo_cuando_el_recibido_no_cumple_el_formato(valor):
    assert resolver_trace_id(_peticion_con(valor), _GeneradorFijo()) == NUEVO


def test_resolver_trace_id_genera_uno_nuevo_cuando_no_hay_cabecera():
    assert resolver_trace_id(_peticion_con(None), _GeneradorFijo()) == NUEVO


def test_generador_uuid_produce_trace_ids_validos_y_distintos():
    generador = UuidTraceIdGenerator()
    primero, segundo = generador.nuevo(), generador.nuevo()

    for generado in (primero, segundo):
        assert resolver_trace_id(_peticion_con(generado), _GeneradorFijo()) == generado
    assert primero != segundo
