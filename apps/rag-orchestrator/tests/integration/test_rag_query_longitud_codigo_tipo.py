"""RN-22: la longitud máxima configurada del código de tipo de cáncer gobierna el filtro de `/rag/query`."""

import dataclasses

from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    BuscadorFalso,
    ChunkFx,
    crear_entorno,
    solicitud_de,
)


def test_rag_query_responde_422_tipo_cancer_no_registrado_cuando_el_codigo_excede_la_longitud_configurada():
    parametros = dataclasses.replace(PARAMETROS_DE_PRUEBA, longitud_maxima_codigo_tipo=4)
    entorno = crear_entorno(parametros=parametros)

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer="mama_x"))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "TIPO_CANCER_NO_REGISTRADO"
    assert entorno.buscador.invocaciones == 0


def test_rag_query_llega_al_buscador_cuando_el_codigo_excede_el_defecto_pero_cabe_en_la_longitud_configurada():
    tipo = "t" * 70
    parametros = dataclasses.replace(PARAMETROS_DE_PRUEBA, longitud_maxima_codigo_tipo=80)
    chunk = ChunkFx("ch-largo-1", "doc-largo", "texto sintético", [1.0] + [0.0] * 7, True, tipo)
    entorno = crear_entorno(parametros=parametros, buscador=BuscadorFalso(chunks=[chunk]))

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer=tipo))

    assert respuesta.status_code == 200
    assert entorno.buscador.invocaciones >= 1
