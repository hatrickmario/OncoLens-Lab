"""`POST /rag/query`, línea actual en la consulta de recuperación (US-116 / L1D-113 AC-2): IA-03, RN-03, RN-11.

El resumen que se embebe junto con la pregunta (rama dense) añade «línea de tratamiento {n}» cuando ``currentLine`` no es
``null`` y nunca la etiqueta, la clave ni la palabra «desconocido» de un dato faltante. La rama sparse y la reescritura
no reciben el resumen: usan solo la pregunta.
"""

import pytest

from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.schemas.generated.models import ClinicalContext
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

LINEA_ACTUAL = "línea de tratamiento 1"
PROHIBIDOS_EN_LA_CONSULTA = (
    "Estado menopáusico",
    "Ki-67",
    "estado_menopausico",
    "ki67",
    "desconocido",
)


def _solicitud(linea: int | None) -> dict:
    solicitud = solicitud_de(Q_HER2)
    solicitud["clinicalContext"]["currentLine"] = linea
    solicitud["clinicalContext"]["missingCriticalData"] = ["estado_menopausico", "ki67"]
    return solicitud


def _resumen(linea: int | None) -> str:
    return resumen_del_contexto_clinico(
        ClinicalContext.model_validate(_solicitud(linea)["clinicalContext"])
    )


@pytest.mark.ac("US-116", 2)
def test_rag_query_embebe_la_linea_actual_y_ningun_valor_faltante_cuando_hay_linea_y_faltantes():
    entorno = crear_entorno()

    respuesta = entorno.consultar(_solicitud(1))

    assert respuesta.status_code == 200
    resumenes = [t for t in entorno.embedder.textos if t != Q_HER2]
    assert len(resumenes) == 1
    assert LINEA_ACTUAL in resumenes[0]
    for texto in entorno.embedder.textos:
        for ajeno in PROHIBIDOS_EN_LA_CONSULTA:
            assert ajeno not in texto


@pytest.mark.ac("US-116", 2)
def test_rag_query_no_agrega_linea_al_resumen_embebido_cuando_la_linea_actual_es_null():
    entorno = crear_entorno()

    respuesta = entorno.consultar(_solicitud(None))

    assert respuesta.status_code == 200
    resumenes = [t for t in entorno.embedder.textos if t != Q_HER2]
    assert len(resumenes) == 1
    assert "línea de tratamiento" not in resumenes[0]
    assert resumenes[0] == _resumen(None)


def test_el_resumen_termina_con_la_linea_actual_despues_de_diagnostico_y_biomarcadores():
    sin_linea = _resumen(None)

    assert _resumen(2) == f"{sin_linea}; línea de tratamiento 2"


def test_el_resumen_solo_es_la_linea_actual_cuando_no_hay_diagnostico_ni_biomarcadores():
    solicitud = _solicitud(3)
    contexto = solicitud["clinicalContext"]
    contexto["diagnosis"] = None
    contexto["biomarkers"] = []

    assert (
        resumen_del_contexto_clinico(ClinicalContext.model_validate(contexto))
        == "línea de tratamiento 3"
    )


def test_el_resumen_no_cambia_por_los_faltantes():
    con_faltantes = _solicitud(1)
    sin_faltantes = _solicitud(1)
    sin_faltantes["clinicalContext"]["missingCriticalData"] = []

    assert resumen_del_contexto_clinico(
        ClinicalContext.model_validate(con_faltantes["clinicalContext"])
    ) == resumen_del_contexto_clinico(
        ClinicalContext.model_validate(sin_faltantes["clinicalContext"])
    )
