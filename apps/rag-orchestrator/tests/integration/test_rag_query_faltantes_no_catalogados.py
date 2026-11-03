"""`POST /rag/query` con `missingCriticalData` fuera del catálogo (US-116 / L1D-113 AC-3, RN-11): `422` antes de todo trabajo.

Cada elemento debe ser una clave de `datos-criticos.json` del tipo del caso (`^[a-z0-9_]+$`); texto libre o una clave de
otro tipo responde `ErrorValidacion` (`CUERPO_INVALIDO`) con la posición del elemento en `detail[].loc`, sin eco del valor
recibido ni en el cuerpo ni en los logs, y sin invocar idioma, release, embeddings, Milvus, reranker, LLM ni NLI. El
`409` por otra versión del catálogo manda sobre el `422`.
"""

import logging

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    Q_HER2,
    VERSION_DEL_CATALOGO_MONTADO,
    CatalogoClinicoFalso,
    crear_entorno,
    solicitud_de,
)

RESPUESTA_422 = "#/paths/~1rag~1query/post/responses/422"
TEXTO_LIBRE = "Estado menopáusico de la paciente"
VERSION_AJENA = "9.9.9-ajena"


def _con_faltantes(faltantes: list[str], tipo_de_cancer: str = "mama") -> dict:
    solicitud = solicitud_de(Q_HER2, tipo_de_cancer=tipo_de_cancer)
    solicitud["clinicalContext"]["missingCriticalData"] = faltantes
    return solicitud


def _exigir_cero_invocaciones(entorno) -> None:
    assert entorno.detector_idioma.invocaciones == 0
    assert entorno.lector_release.invocaciones == 0
    assert entorno.embedder.invocaciones == 0
    assert entorno.buscador.invocaciones == 0
    assert entorno.reranker.invocaciones == 0
    assert entorno.generador.invocaciones == 0
    assert entorno.clasificador_nli.invocaciones == 0


@pytest.mark.ac("US-116", 3)
def test_rag_query_faltante_en_texto_libre_responde_422_sin_eco_ni_puertos_invocados(caplog):
    caplog.set_level(logging.DEBUG)
    entorno = crear_entorno()
    solicitud = _con_faltantes(["ki67", TEXTO_LIBRE])

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 422
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA_422, cuerpo)
    assert cuerpo["error"] == "CUERPO_INVALIDO"
    assert cuerpo["detail"][0]["loc"] == ["body", "clinicalContext", "missingCriticalData", 1]
    assert TEXTO_LIBRE not in respuesta.text
    assert TEXTO_LIBRE not in caplog.text
    _exigir_cero_invocaciones(entorno)


@pytest.mark.ac("US-116", 3)
def test_rag_query_faltante_de_otro_tipo_de_cancer_responde_422_sin_invocar_puertos():
    entorno = crear_entorno()

    respuesta = entorno.consultar(_con_faltantes(["psa_serie"], tipo_de_cancer="mama"))

    assert respuesta.status_code == 422
    assert_matches_spec(RESPUESTA_422, respuesta.json())
    assert respuesta.json()["detail"][0]["loc"] == [
        "body",
        "clinicalContext",
        "missingCriticalData",
        0,
    ]
    assert "psa_serie" not in respuesta.text
    _exigir_cero_invocaciones(entorno)


@pytest.mark.ac("US-116", 3)
def test_rag_query_catalogo_de_otra_version_con_faltante_no_catalogado_responde_409_y_no_422():
    entorno = crear_entorno(catalogo_clinico=CatalogoClinicoFalso(VERSION_DEL_CATALOGO_MONTADO))
    solicitud = {**_con_faltantes([TEXTO_LIBRE]), "catalogVersion": VERSION_AJENA}

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "CATALOG_VERSION_MISMATCH"
    _exigir_cero_invocaciones(entorno)


def test_rag_query_responde_200_cuando_los_faltantes_son_claves_del_catalogo():
    entorno = crear_entorno()

    respuesta = entorno.consultar(_con_faltantes(["estado_menopausico", "ki67"]))

    assert respuesta.status_code == 200
