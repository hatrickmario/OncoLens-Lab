"""`POST /rag/query`, aplicabilidad por criterio de las fuentes recuperadas (US-122 / L1D-127): FR-25, RN-25, RN-28, ADR-34.

Corpus FX-08b-a (``doc-a1``…``doc-a6``), paciente A-M1 y catálogo de test ``test-apl-1.0.0`` (L1D-126); LLM, NLI,
reranker y Milvus falsos. Cada respuesta la valida contra el spec del proveedor el hook de ``verificacion_proveedor.py``.
"""

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from tests.support.aplicabilidad import (
    CRITERIOS_DE_DOC_A1,
    FICHAS_FX08BA,
    GeneradorDeAplicabilidad,
    catalogo_de_test_sin_criterios,
    entorno_de_aplicabilidad,
    escribir_aplicabilidad,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.catalogo_aplicabilidad import APL_1_0_0, APL_1_0_1
from tests.support.poblacion_lista import poblacion_guardada
from tests.support.recuperacion import CatalogoFalso

RELEVANCIA_ALTA = 0.90


def _consultar(
    documentos: dict[str, float],
    *,
    solicitud: dict[str, Any] | None = None,
    catalogo: Path = APL_1_0_0,
    generador: GeneradorDeAplicabilidad | None = None,
    catalogo_falso: CatalogoFalso | None = None,
) -> dict[str, Any]:
    entorno = entorno_de_aplicabilidad(
        documentos, catalogo=catalogo, generador=generador, catalogo_falso=catalogo_falso
    )
    respuesta = entorno.consultar(solicitud or solicitud_a_m1(catalogo.name))
    assert respuesta.status_code == 200
    return respuesta.json()


def _criterios_de(cuerpo: dict[str, Any], documento: str) -> dict[str, dict[str, Any]]:
    fuentes = [f for f in cuerpo["applicability"] if f["externalId"] == external_id_de(documento)]
    assert len(fuentes) == 1, f"se esperaba una sola fuente para {documento}"
    return {c["criterion"]: c for c in fuentes[0]["criteria"]}


@pytest.mark.ac("US-122", 1)
def test_rag_query_trae_estado_her2_coincide_con_valores_copiados_cuando_se_recupera_doc_a1():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA})

    assert cuerpo["status"] == "con_evidencia"
    assert [f["externalId"] for f in cuerpo["applicability"]] == [external_id_de("doc-a1")]
    criterios = _criterios_de(cuerpo, "doc-a1")
    her2 = criterios["estado_her2"]
    assert her2["patientValue"] == "3+ (IHQ)"
    assert her2["studyPopulationValue"] == "positivo"
    assert her2["status"] == "coincide"
    assert her2["isExclusionary"] is True
    assert [c["externalId"] for c in her2["citedSources"]] == [external_id_de("doc-a1")]
    ecog = criterios["ecog"]
    assert (ecog["patientValue"], ecog["studyPopulationValue"], ecog["status"]) == (
        "1",
        "0-1",
        "coincide",
    )
    estadio = criterios["estadio"]
    assert (estadio["patientValue"], estadio["studyPopulationValue"]) == ("IIA", "I–III")
    assert (estadio["status"], estadio["unknownReason"]) == ("desconocido", None)
    linea = criterios["linea_tratamiento"]
    assert (linea["patientValue"], linea["status"], linea["unknownReason"]) == (
        "1",
        "desconocido",
        "no_reportado_por_fuente",
    )
    assert linea["studyPopulationValue"] is None
    menopausia = criterios["estado_menopausico"]
    assert (menopausia["patientValue"], menopausia["status"], menopausia["unknownReason"]) == (
        None,
        "desconocido",
        "falta_en_paciente",
    )
    assert list(criterios) == [
        "estado_her2",
        "estadio",
        "ecog",
        "estado_menopausico",
        "linea_tratamiento",
    ]


@pytest.mark.ac("US-122", 2)
def test_rag_query_conserva_patient_value_del_contexto_cuando_el_llm_falso_atribuye_2_mas_al_paciente():
    solicitud = solicitud_a_m1()
    generador = GeneradorDeAplicabilidad("APL-VALOR-PACIENTE")

    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA}, solicitud=solicitud, generador=generador)

    assert generador.invocaciones == 1
    assert "2+" in cuerpo["evidenceOptions"][0]["rationale"]  # el LLM falso sí lo dijo
    assert _criterios_de(cuerpo, "doc-a1")["estado_her2"]["patientValue"] == "3+ (IHQ)"
    assert "2+" not in json.dumps(cuerpo["applicability"], ensure_ascii=False)


def _catalogo_con_criterios_de_prueba(raiz: Path) -> Path:
    """Catálogo de test propio (``test-apl-1.0.0``): RE/RP como lista y ECOG con escala; prostata sin criterios."""
    catalogo = raiz / APL_1_0_0.name
    original = json.loads((APL_1_0_0 / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))
    por_clave = {item["key"]: item for item in original["items"]}
    receptores = {
        "key": "receptores_hormonales",
        "cancerType": "mama",
        "studyKey": "biomarcadores.receptores_hormonales",
        "label": {"es": "Receptores hormonales"},
        "destination": {"entity": "Biomarker", "field": "value", "match": {"name": ["RE", "RP"]}},
        "isExclusionary": False,
        "rule": {"operator": "pertenencia", "partial": {"when": "solo_subgrupo"}},
        "estado": "propuesta",
    }
    escribir_aplicabilidad(catalogo, "mama", [receptores, por_clave["ecog"]])
    escribir_aplicabilidad(catalogo, "prostata", [])
    return catalogo


def _paciente_con(
    biomarcadores: dict[str, str], escala: str = "ECOG", valor: int = 1
) -> dict[str, Any]:
    solicitud = copy.deepcopy(solicitud_a_m1())
    plantilla = solicitud["clinicalContext"]["biomarkers"][0]
    solicitud["clinicalContext"]["biomarkers"] = [
        {**plantilla, "dataRef": f"r{10 + i}", "biomarkerName": nombre, "value": texto}
        for i, (nombre, texto) in enumerate(biomarcadores.items())
    ]
    diagnostico = solicitud["clinicalContext"]["diagnosis"]
    diagnostico["performanceScale"], diagnostico["performanceValue"] = escala, valor
    return solicitud


def _poblacion_con_receptores() -> dict[str, PoblacionDelEstudio]:
    criterios = {**CRITERIOS_DE_DOC_A1, "biomarcadores": {"receptores_hormonales": "positivo"}}
    return {"doc-a1": poblacion_guardada("fuente_estructurada", criterios)}


@pytest.mark.ac("US-122", 2)
def test_rag_query_rotula_los_valores_de_la_lista_y_no_copia_ecog_con_otra_escala_cuando_el_catalogo_declara_re_rp(
    tmp_path: Path,
):
    catalogo = _catalogo_con_criterios_de_prueba(tmp_path)
    falso = CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=_poblacion_con_receptores())

    def evaluar(solicitud: dict[str, Any]) -> dict[str, dict[str, Any]]:
        cuerpo = _consultar(
            {"doc-a1": RELEVANCIA_ALTA},
            solicitud=solicitud,
            catalogo=catalogo,
            catalogo_falso=falso,
        )
        return _criterios_de(cuerpo, "doc-a1")

    completo = evaluar(_paciente_con({"RE": "Positivo (80%)", "RP": "Negativo"}))
    solo_re = evaluar(_paciente_con({"RE": "Positivo (80%)"}))
    karnofsky = evaluar(_paciente_con({"RE": "Positivo (80%)"}, escala="Karnofsky", valor=80))

    receptores = completo["receptores_hormonales"]
    assert receptores["patientValue"] == "RE: Positivo (80%); RP: Negativo"
    assert receptores["status"] == "desconocido"
    assert solo_re["receptores_hormonales"]["patientValue"] is None
    assert solo_re["receptores_hormonales"]["status"] == "desconocido"
    assert solo_re["receptores_hormonales"]["unknownReason"] == "falta_en_paciente"
    assert karnofsky["ecog"]["patientValue"] is None
    assert karnofsky["ecog"]["status"] == "desconocido"
    assert karnofsky["ecog"]["unknownReason"] == "falta_en_paciente"


@pytest.mark.ac("US-122", 3)
def test_rag_query_deja_estado_her2_en_no_coincide_cuando_doc_a4_publica_her2_negativo():
    cuerpo = _consultar({"doc-a4": RELEVANCIA_ALTA})

    her2 = _criterios_de(cuerpo, "doc-a4")["estado_her2"]
    assert her2["status"] == "no_coincide"
    assert her2["studyPopulationValue"] == "negativo"
    assert her2["isExclusionary"] is True


@pytest.mark.ac("US-122", 4)
def test_rag_query_deja_ecog_en_parcial_cuando_doc_a5_reporta_ecog_0_1_con_alcance_subgrupo():
    cuerpo = _consultar({"doc-a5": RELEVANCIA_ALTA})

    ecog = _criterios_de(cuerpo, "doc-a5")["ecog"]
    assert ecog["status"] == "parcial"
    assert ecog["studyPopulationValue"] == "0-1"


@pytest.mark.ac("US-122", 5)
def test_rag_query_deja_cada_criterio_desconocido_sin_valor_del_estudio_cuando_doc_a3_no_tiene_poblacion():
    cuerpo = _consultar({"doc-a3": RELEVANCIA_ALTA})

    criterios = _criterios_de(cuerpo, "doc-a3")
    assert all(c["status"] == "desconocido" for c in criterios.values())
    assert all(c["studyPopulationValue"] is None for c in criterios.values())
    for clave in ("estado_her2", "estadio", "ecog", "linea_tratamiento"):
        assert criterios[clave]["unknownReason"] == "no_reportado_por_fuente"
    assert criterios["estado_menopausico"]["unknownReason"] == "falta_en_paciente"


@pytest.mark.ac("US-122", 6)
def test_rag_query_da_una_applicability_identica_y_una_sola_invocacion_del_llm_por_consulta_cuando_se_procesa_dos_veces_doc_a1(
    tmp_path: Path,
):
    generador = GeneradorDeAplicabilidad()
    entorno = entorno_de_aplicabilidad({"doc-a1": RELEVANCIA_ALTA}, generador=generador)
    primera = entorno.consultar(solicitud_a_m1()).json()
    invocaciones_tras_la_primera = generador.invocaciones
    segunda = entorno.consultar(solicitud_a_m1()).json()

    assert primera["applicability"] and primera["applicability"] == segunda["applicability"]
    assert invocaciones_tras_la_primera == 1
    assert generador.invocaciones == 2

    sin_criterios = catalogo_de_test_sin_criterios(tmp_path)
    generador_sin_criterios = GeneradorDeAplicabilidad()
    cuerpo = _consultar(
        {"doc-a1": RELEVANCIA_ALTA}, catalogo=sin_criterios, generador=generador_sin_criterios
    )
    assert cuerpo["applicability"] == []
    assert generador_sin_criterios.invocaciones == invocaciones_tras_la_primera


@pytest.mark.ac("US-121", 5)
def test_rag_query_cambia_ecog_de_coincide_a_no_coincide_sin_tocar_el_resto_cuando_cambia_el_catalogo_montado():
    con_1_0_0 = _criterios_de(_consultar({"doc-a1": RELEVANCIA_ALTA}, catalogo=APL_1_0_0), "doc-a1")
    con_1_0_1 = _criterios_de(_consultar({"doc-a1": RELEVANCIA_ALTA}, catalogo=APL_1_0_1), "doc-a1")

    assert con_1_0_0["ecog"]["status"] == "coincide"
    assert con_1_0_1["ecog"]["status"] == "no_coincide"
    sin_ecog = [c for c in con_1_0_0 if c != "ecog"]
    assert {c: con_1_0_0[c] for c in sin_ecog} == {c: con_1_0_1[c] for c in sin_ecog}


@pytest.mark.ac("US-122", 1)
def test_rag_query_cita_la_fuente_en_todo_criterio_con_valor_del_estudio_aunque_sea_desconocido_cuando_se_recupera_doc_a1():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA})

    criterios = _criterios_de(cuerpo, "doc-a1")
    citada = [external_id_de("doc-a1")]
    for clave in ("estado_her2", "ecog", "estadio"):  # estadio: desconocido con valor del estudio
        assert criterios[clave]["studyPopulationValue"] is not None
        assert [c["externalId"] for c in criterios[clave]["citedSources"]] == citada
    for clave in ("linea_tratamiento", "estado_menopausico"):  # sin valor del estudio: sin cita
        assert criterios[clave]["studyPopulationValue"] is None
        assert criterios[clave]["citedSources"] == []
