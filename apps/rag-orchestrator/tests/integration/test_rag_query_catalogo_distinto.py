"""`POST /rag/query` con un catálogo de otra versión (US-041 / L1D-171, NFR-14): `409` antes de todo trabajo.

La versión de la solicitud se compara con la del catálogo montado como PRIMER paso del servicio; con otra versión no
se invoca ningún borde (idioma, release, embeddings, Milvus, reranker, LLM ni NLI) y la respuesta es el `409` del
contrato con mensaje fijo, sin eco de la versión ajena (RN-10, RN-14).
"""

import json

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    EJEMPLOS,
    Q_HER2,
    VERSION_DEL_CATALOGO_MONTADO,
    CatalogoClinicoFalso,
    crear_entorno,
    solicitud_de,
)

RESPUESTA_409 = "#/paths/~1rag~1query/post/responses/409"
VERSION_AJENA = "9.9.9-ajena"


def _ejemplo_409() -> dict:
    return json.loads((EJEMPLOS / "rag-catalog-version-mismatch.json").read_text(encoding="utf-8"))


def _solicitud_con_catalogo(version: str) -> dict:
    return {**solicitud_de(Q_HER2), "catalogVersion": version}


@pytest.mark.ac("US-041", 2)
def test_rag_query_catalogo_distinto_responde_409_sin_invocar():
    entorno = crear_entorno(catalogo_clinico=CatalogoClinicoFalso(VERSION_DEL_CATALOGO_MONTADO))
    solicitud = _solicitud_con_catalogo(VERSION_AJENA)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 409
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA_409, cuerpo)
    assert cuerpo == {**_ejemplo_409(), "traceId": solicitud["traceId"]}
    assert entorno.detector_idioma.invocaciones == 0
    assert entorno.lector_release.invocaciones == 0
    assert entorno.embedder.invocaciones == 0
    assert entorno.buscador.invocaciones == 0
    assert entorno.reranker.invocaciones == 0
    assert entorno.generador.invocaciones == 0
    assert entorno.clasificador_nli.invocaciones == 0
    assert entorno.catalogo.consultas == []
    assert entorno.catalogo_clinico.consultas == 1
    for ajeno in (VERSION_AJENA, VERSION_DEL_CATALOGO_MONTADO, Q_HER2):
        assert ajeno not in respuesta.text


def test_rag_query_responde_200_cuando_la_version_del_catalogo_coincide():
    entorno = crear_entorno(catalogo_clinico=CatalogoClinicoFalso(VERSION_DEL_CATALOGO_MONTADO))

    respuesta = entorno.consultar(_solicitud_con_catalogo(VERSION_DEL_CATALOGO_MONTADO))

    assert respuesta.status_code == 200
    assert respuesta.json()["meta"]["catalogVersion"] == VERSION_DEL_CATALOGO_MONTADO


def test_rag_query_no_registra_las_versiones_de_catalogo_ni_la_pregunta_cuando_responde_409(
    logs_json,
):
    entorno = crear_entorno()

    respuesta = entorno.consultar(_solicitud_con_catalogo(VERSION_AJENA))

    salida = logs_json()
    assert respuesta.status_code == 409
    assert "catalog_version_mismatch" in salida, (
        "el 409 debe dejar su evento en el canal real de logs"
    )
    for prohibido in (VERSION_AJENA, VERSION_DEL_CATALOGO_MONTADO, Q_HER2):
        assert prohibido not in salida
