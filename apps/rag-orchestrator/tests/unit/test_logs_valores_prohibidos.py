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
