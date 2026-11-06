"""Verbalización de la declaración `sin_tratamiento_previo` (d5fb-04, D6, ADR-34, RN-11, RN-24).

Dominio puro: sin adapters ni LLM. La frase sale de la declaración del contexto, nunca del texto generado.
"""

import pytest

from app.application.contexto_del_paciente import contexto_del_paciente
from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.domain.applicability_rules import valor_del_paciente
from app.domain.criterios_aplicabilidad import DestinoDelCriterio
from app.prompts.rag_query import bloque_de_datos_del_paciente
from app.schemas.generated.models import ClinicalContext
from tests.support.recuperacion import solicitud_de

FRASE = "Sin tratamiento previo a la fecha"


def _procedencia(**cambios) -> dict:
    return {
        "entryMethod": "manual",
        "extractionConfidence": "n_a",
        "reviewStatus": "verificado",
        "conflict": False,
        **cambios,
    }


def _contexto(*, declaracion: dict | None = None, con_tratamiento: bool = False) -> ClinicalContext:
    datos = solicitud_de()["clinicalContext"]
    datos["attributes"] = [] if declaracion is None else [declaracion]
    if not con_tratamiento:
        datos["priorTreatments"] = []
    return ClinicalContext.model_validate(datos)


def _declaracion(meses: int | None = 3, **procedencia) -> dict:
    return {
        "dataRef": "r9",
        "key": "sin_tratamiento_previo",
        "value": "si",
        "monthsAgo": meses,
        "provenance": _procedencia(**procedencia),
    }


@pytest.mark.ac("D5FB-04", 1)
def test_bloque_de_datos_verbaliza_la_declaracion_con_fecha_relativa_cuando_no_hay_tratamientos():
    bloque = bloque_de_datos_del_paciente(_contexto(declaracion=_declaracion(3)))

    assert f"- {FRASE} (declarado hace 3 meses)" in bloque.splitlines()


def test_bloque_de_datos_omite_el_hecho_cuando_no_hay_declaracion_ni_tratamientos():
    bloque = bloque_de_datos_del_paciente(_contexto())

    assert "tratamiento" not in bloque.lower()


def test_bloque_de_datos_omite_la_declaracion_cuando_el_contexto_trae_tratamientos():
    bloque = bloque_de_datos_del_paciente(
        _contexto(declaracion=_declaracion(), con_tratamiento=True)
    )

    assert FRASE not in bloque


def test_bloque_de_datos_declara_sin_fecha_cuando_la_declaracion_no_tiene_meses():
    bloque = bloque_de_datos_del_paciente(_contexto(declaracion=_declaracion(None)))

    assert f"- {FRASE} (declarado)" in bloque.splitlines()


def test_bloque_de_datos_usa_singular_cuando_la_declaracion_es_de_hace_un_mes():
    bloque = bloque_de_datos_del_paciente(_contexto(declaracion=_declaracion(1)))

    assert f"- {FRASE} (declarado hace 1 mes)" in bloque.splitlines()


def test_bloque_de_datos_etiqueta_la_declaracion_sin_verificar_cuando_requiere_revision():
    bloque = bloque_de_datos_del_paciente(
        _contexto(declaracion=_declaracion(2, reviewStatus="requiere_revision"))
    )

    assert f"- {FRASE} (declarado hace 2 meses) (sin verificar)" in bloque.splitlines()


def test_bloque_de_datos_ignora_la_declaracion_cuando_su_valor_no_es_si():
    declaracion = {**_declaracion(), "value": "no"}

    assert FRASE not in bloque_de_datos_del_paciente(_contexto(declaracion=declaracion))


def test_bloque_de_datos_no_incluye_referencias_ni_fechas_absolutas_cuando_hay_declaracion():
    bloque = bloque_de_datos_del_paciente(_contexto(declaracion=_declaracion(14)))
    frase = next(linea for linea in bloque.splitlines() if FRASE in linea)

    assert frase == f"- {FRASE} (declarado hace 14 meses)"
    assert "r9" not in bloque


def test_resumen_para_embeddings_no_cambia_cuando_hay_declaracion():
    con = _contexto(declaracion=_declaracion())
    sin = _contexto()

    assert resumen_del_contexto_clinico(con) == resumen_del_contexto_clinico(sin)


def test_linea_tratamiento_sigue_sin_valor_cuando_el_paciente_solo_declara_sin_tratamiento():
    paciente = contexto_del_paciente(_contexto(declaracion=_declaracion()))
    destino = DestinoDelCriterio("PriorTreatment", "line_number", {})

    assert valor_del_paciente(paciente, destino) is None
