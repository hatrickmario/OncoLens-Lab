"""`POST /rag/query` con un tipo de cáncer no habilitado (US-043 / L1D-173, RN-20, B-10): `422` antes de todo trabajo.

El tipo del diagnóstico se compara con `ENABLED_CANCER_TYPES` (no con el manifiesto) después del filtro de recuperación y
antes de cualquier puerto; con un tipo no habilitado no se invoca ningún borde (idioma, release, embeddings, Milvus,
reranker, LLM ni NLI) y la respuesta es el `422 TIPO_NO_HABILITADO` del contrato con mensaje fijo, sin eco del tipo ni
de la pregunta (RN-10).
"""

import dataclasses
import json

import pytest

from tests.support.recuperacion import (
    EJEMPLOS,
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    crear_entorno,
    solicitud_de,
)

TIPO_CATALOGADO_NO_HABILITADO = "prostata"
TIPO_FUERA_DEL_MANIFIESTO = "pulmon"
SOLO_MAMA = dataclasses.replace(PARAMETROS_DE_PRUEBA, tipos_habilitados=("mama",))


def _ejemplo_422() -> dict:
    return json.loads(
        (EJEMPLOS / "rag-query-tipo-no-habilitado-422.json").read_text(encoding="utf-8")
    )


def _exigir_422_sin_trabajo(entorno, solicitud, respuesta, tipo: str) -> None:
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
    for ajeno in (tipo, Q_HER2):
        assert ajeno not in respuesta.text


@pytest.mark.ac("US-043", 4)
def test_rag_query_tipo_no_habilitado_responde_422_sin_invocar_llm():
    entorno = crear_entorno(parametros=SOLO_MAMA)
    solicitud = solicitud_de(Q_HER2, tipo_de_cancer=TIPO_CATALOGADO_NO_HABILITADO)

    respuesta = entorno.consultar(solicitud)

    _exigir_422_sin_trabajo(entorno, solicitud, respuesta, TIPO_CATALOGADO_NO_HABILITADO)


def test_rag_query_tipo_fuera_del_manifiesto_responde_422_sin_invocar_ningun_borde():
    entorno = crear_entorno()
    solicitud = solicitud_de(Q_HER2, tipo_de_cancer=TIPO_FUERA_DEL_MANIFIESTO)

    respuesta = entorno.consultar(solicitud)

    _exigir_422_sin_trabajo(entorno, solicitud, respuesta, TIPO_FUERA_DEL_MANIFIESTO)


def test_rag_query_responde_200_cuando_el_tipo_del_diagnostico_esta_habilitado():
    entorno = crear_entorno(parametros=SOLO_MAMA)

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer="mama"))

    assert respuesta.status_code == 200
