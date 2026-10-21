"""`POST /rag/query` con un tipo de cáncer no habilitado (US-043 / L1D-173, RN-20, B-10): `422` antes de todo trabajo.

El tipo del diagnóstico se compara con `ENABLED_CANCER_TYPES` justo después de la versión del catálogo y antes de
recuperar; con un tipo ajeno no se invoca ningún borde (idioma, release, embeddings, Milvus, reranker, LLM ni NLI) y la
respuesta es el `422 TIPO_NO_HABILITADO` del contrato con mensaje fijo, sin eco del tipo ni de la pregunta (RN-10).
"""

import json

import pytest

from tests.support.recuperacion import EJEMPLOS, Q_HER2, crear_entorno, solicitud_de

TIPO_AJENO = "pulmon"


def _ejemplo_422() -> dict:
    return json.loads(
        (EJEMPLOS / "rag-query-tipo-no-habilitado-422.json").read_text(encoding="utf-8")
    )


@pytest.mark.ac("US-043", 4)
def test_rag_query_tipo_no_habilitado_responde_422_sin_invocar_llm():
    entorno = crear_entorno()
    solicitud = solicitud_de(Q_HER2, tipo_de_cancer=TIPO_AJENO)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 422
    assert respuesta.json() == {**_ejemplo_422(), "traceId": solicitud["traceId"]}
    assert entorno.detector_idioma.invocaciones == 0
    assert entorno.lector_release.invocaciones == 0
    assert entorno.embedder.invocaciones == 0
    assert entorno.buscador.invocaciones == 0
    assert entorno.reranker.invocaciones == 0
    assert entorno.generador.invocaciones == 0
    assert entorno.clasificador_nli.invocaciones == 0
    assert entorno.catalogo.consultas == []
    for ajeno in (TIPO_AJENO, Q_HER2):
        assert ajeno not in respuesta.text
