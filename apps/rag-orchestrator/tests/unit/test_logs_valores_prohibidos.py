"""El helper de valores prohibidos mira el contenido del log, no la hora: sin falsos positivos y sin ceguera."""

import json

import pytest

from tests.support.logs import exigir_sin_valores_prohibidos

VALOR = "1.7"
HORA_CON_EL_VALOR = "2026-10-20T23:27:11.789225+00:00"  # contiene "1.7" por azar del reloj


def _linea(**campos: object) -> str:
    base = {
        "time": HORA_CON_EL_VALOR,
        "level": "error",
        "logger": "app",
        "message": "configuracion_invalida",
    }
    return json.dumps({**base, **campos})


def test_no_falla_cuando_el_valor_prohibido_solo_coincide_con_el_campo_time():
    salida = _linea(event="configuracion_invalida", variable="RELEVANCE_THRESHOLD") + "\n"

    exigir_sin_valores_prohibidos(salida, [VALOR])


@pytest.mark.parametrize(
    "campo", ["message", "valorInvalido", "regla", "variable", "traceId", "event"]
)
def test_la_sonda_detecta_el_valor_prohibido_cuando_aparece_en_un_campo_de_contenido(campo):
    # Mutación: la exclusión de `time` no puede dejar ciego al helper en el resto de los campos.
    salida = _linea(**{campo: f"fuera de rango: {VALOR}"}) + "\n"

    with pytest.raises(AssertionError, match="aparece en los logs"):
        exigir_sin_valores_prohibidos(salida, [VALOR])


def test_la_sonda_detecta_el_valor_prohibido_cuando_hay_una_linea_que_no_es_json():
    salida = _linea() + "\n" + f"Traceback: valor {VALOR}\n"

    with pytest.raises(AssertionError, match="aparece en los logs"):
        exigir_sin_valores_prohibidos(salida, [VALOR])


def test_la_sonda_detecta_el_valor_prohibido_cuando_esta_anidado_en_un_campo():
    salida = _linea(detalle={"lista": ["x", f"y{VALOR}"]}) + "\n"

    with pytest.raises(AssertionError, match="aparece en los logs"):
        exigir_sin_valores_prohibidos(salida, [VALOR])


def _detecta(salida: str, valor: str = VALOR) -> None:
    with pytest.raises(AssertionError, match="aparece en los logs"):
        exigir_sin_valores_prohibidos(salida, [valor])


def test_la_sonda_detecta_el_valor_prohibido_cuando_el_campo_time_no_es_una_marca_de_tiempo():
    _detecta('{"time": "SENT-1.7", "message": "x"}\n')


def test_la_sonda_detecta_el_valor_prohibido_cuando_time_no_es_un_texto():
    _detecta('{"time": 1.7, "message": "x"}\n')


def test_la_sonda_detecta_el_valor_prohibido_cuando_time_tiene_otra_zona_horaria():
    _detecta('{"time": "2026-10-20T23:27:11.789225+01:00", "message": "x"}\n')


def test_la_sonda_detecta_el_valor_prohibido_cuando_la_clave_time_esta_anidada():
    _detecta(_linea(detalle={"time": HORA_CON_EL_VALOR}) + "\n")


def test_la_sonda_detecta_el_valor_prohibido_cuando_un_mensaje_repite_la_clave():
    _detecta('{"message": "SENT-1.7", "message": "ok"}\n')


def test_la_sonda_detecta_el_valor_prohibido_cuando_time_repite_la_clave():
    _detecta(f'{{"time": "SENT-1.7", "time": "{HORA_CON_EL_VALOR}"}}\n')


@pytest.mark.parametrize("literal", ["1.70", "1e5", "true", "null", "NaN"])
def test_la_sonda_detecta_el_valor_prohibido_cuando_esta_escrito_como_literal_json(literal):
    _detecta(f'{{"message": "x", "valor": {literal}}}\n', literal)


def test_la_sonda_detecta_el_valor_prohibido_cuando_esta_dentro_de_una_clave():
    _detecta(_linea(**{f"clave-{VALOR}": "x"}) + "\n")


@pytest.mark.parametrize(
    "linea", [f'["{VALOR}"]', f'"{VALOR}"', f'texto previo {{"message": "{VALOR}"}}']
)
def test_la_sonda_detecta_el_valor_prohibido_cuando_la_linea_no_es_un_objeto_json(linea):
    _detecta(linea + "\n")


def test_no_falla_cuando_varias_lineas_traen_time_valido_sin_el_valor_en_el_contenido():
    exigir_sin_valores_prohibidos(_linea() + "\n" + _linea() + "\n", [VALOR])
