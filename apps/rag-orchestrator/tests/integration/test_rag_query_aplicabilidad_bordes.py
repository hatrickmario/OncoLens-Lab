"""Bordes de la aplicabilidad de `/rag/query` (L1D-127): fallo cerrado de la lectura de población y no-fuga en logs.

Test después (tareas 1.11 y 1.13). Cada respuesta la valida contra el spec del proveedor el hook de
``verificacion_proveedor.py`` (US-214).
"""

import logging

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from tests.support.aplicabilidad import (
    FICHAS_FX08BA,
    POBLACIONES_FX08BA,
    catalogo_de_test_sin_criterios,
    entorno_de_aplicabilidad,
    solicitud_a_m1,
)
from tests.support.logs import exigir_sin_valores_prohibidos
from tests.support.recuperacion import CatalogoFalso

RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"
SENTINELA_PACIENTE = "SENTINELA-PACIENTE-4K"
SENTINELA_ESTUDIO = "SENTINELA-ESTUDIO-8Z"
SENTINELA_FALLO = "SENTINELA-HOST-INTERNO-pg.test:5432"
SENTINELA_ESTADIO = "SENTINELA-ESTADIO-2M"
SENTINELA_ATRIBUTO = "SENTINELA-ATRIBUTO-6P"


def test_rag_query_responde_503_retrieval_unavailable_sin_applicability_ni_eco_cuando_falla_el_lector_de_poblacion(
    caplog,
):
    solicitud = solicitud_a_m1()
    falso = CatalogoFalso(
        fichas=FICHAS_FX08BA,
        poblaciones=POBLACIONES_FX08BA,
        error_de_poblacion=RuntimeError(f"{SENTINELA_FALLO} {solicitud['query']}"),
    )
    entorno = entorno_de_aplicabilidad({"doc-a1": 0.90}, catalogo_falso=falso)
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "RETRIEVAL_UNAVAILABLE"
    assert "applicability" not in cuerpo
    assert SENTINELA_FALLO not in respuesta.text
    assert solicitud["query"] not in respuesta.text
    exigir_sin_valores_prohibidos(
        "\n".join(r.getMessage() for r in caplog.records), [SENTINELA_FALLO, solicitud["query"]]
    )


def test_rag_query_no_lee_la_poblacion_cuando_el_catalogo_no_declara_criterios(tmp_path):
    falso = CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=POBLACIONES_FX08BA)
    entorno = entorno_de_aplicabilidad(
        {"doc-a1": 0.90}, catalogo=catalogo_de_test_sin_criterios(tmp_path), catalogo_falso=falso
    )

    respuesta = entorno.consultar(solicitud_a_m1())

    assert respuesta.status_code == 200
    assert respuesta.json()["applicability"] == []
    assert falso.consultas_de_poblacion == []


def _solicitud_con_centinelas() -> dict:
    solicitud = solicitud_a_m1()
    contexto = solicitud["clinicalContext"]
    contexto["biomarkers"][0]["value"] = f"3+ ({SENTINELA_PACIENTE})"
    contexto["diagnosis"]["stageValue"] = f"IIA {SENTINELA_ESTADIO}"
    contexto["attributes"] = [
        {
            "dataRef": "r20",
            "key": "estado_menopausico",
            "value": SENTINELA_ATRIBUTO,
            "monthsAgo": 1,
            "provenance": contexto["biomarkers"][0]["provenance"],
        }
    ]
    return solicitud


def _catalogo_con_centinela_del_estudio() -> CatalogoFalso:
    base = POBLACIONES_FX08BA["doc-a1"]
    criterios = {**base.criterios, "estadio": f"I–III {SENTINELA_ESTUDIO}"}
    poblaciones = {"doc-a1": PoblacionDelEstudio(base.metadata_source, criterios)}
    return CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=poblaciones)


def _prohibidos(solicitud: dict) -> list[str]:
    return [
        SENTINELA_PACIENTE,
        SENTINELA_ESTUDIO,
        SENTINELA_ESTADIO,
        SENTINELA_ATRIBUTO,
        solicitud["clinicalContext"]["pseudoPatientId"],
        solicitud["query"],
        "Synthetic adjuvant study",  # texto de los chunks
    ]


def test_rag_query_registra_recuentos_por_estado_y_motivo_sin_valores_cuando_evalua_doc_a1(caplog):
    solicitud = _solicitud_con_centinelas()
    entorno = entorno_de_aplicabilidad(
        {"doc-a1": 0.90}, catalogo_falso=_catalogo_con_centinela_del_estudio()
    )
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    eventos = [
        r.getMessage() for r in caplog.records if "event=rag_query_aplicabilidad" in r.getMessage()
    ]
    assert len(eventos) == 1
    assert f"traceId={solicitud['traceId']}" in eventos[0]
    for recuento in (
        "documentos=1",
        "coincide=2",
        "desconocido=3",
        "sin_escala=1",
        "forma_no_comparable=0",
    ):
        assert recuento in eventos[0]
    exigir_sin_valores_prohibidos(
        "\n".join(r.getMessage() for r in caplog.records), _prohibidos(solicitud)
    )


def test_la_sonda_detecta_un_valor_del_estudio_que_se_cuela_en_un_log():
    # Mutación de la comprobación: si el log trajera el valor del estudio, la aserción de no-fuga debe fallar.
    try:
        exigir_sin_valores_prohibidos(
            f"event=rag_query_aplicabilidad estadio=I–III {SENTINELA_ESTUDIO}", [SENTINELA_ESTUDIO]
        )
    except AssertionError:
        return
    raise AssertionError("la sonda no detectó el valor prohibido")
