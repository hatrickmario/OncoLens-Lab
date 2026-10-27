"""Plantilla del prompt `rag-query@0.1.0` (L1D-275, tarea 2.8): RN-23, `[S1 resp. 15]`, `[S1 resp. 34]`."""

from pathlib import Path

import pytest

from app.domain.alias_de_chunks import asignar_alias
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import (
    PLANTILLA_RAG_QUERY,
    VERSION_DEL_PROMPT,
    bloque_de_datos_del_paciente,
    construir_prompt_rag_query,
)
from app.schemas.generated.models import ClinicalContext
from tests.support.recuperacion import solicitud_de

RAIZ = Path(__file__).resolve().parents[4]
LISTA = RAIZ / "packages" / "clinical-catalogs" / "lenguaje" / "terminos-prohibidos.json"


def _lista() -> ListaTerminos:
    return ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))


def test_plantilla_no_contiene_terminos_de_nivel_a_ni_b_cuando_se_verifica_sin_datos():
    coincidencias = check_prohibited_terms(
        PLANTILLA_RAG_QUERY, _lista(), niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == []


def test_plantilla_contiene_la_instruccion_de_poblacion_y_escenario_atribuida_a_la_fuente():
    texto = " ".join(PLANTILLA_RAG_QUERY.split())

    assert "indica la población y el escenario" in texto
    assert "atribúyelo a la fuente citada" in texto
    assert "no lo dirijas al paciente" in texto


def test_version_del_prompt_es_rag_query_0_3_0_porque_pide_citar_por_alias():
    assert VERSION_DEL_PROMPT == "rag-query@0.3.0"


def test_prompt_incluye_pregunta_contexto_y_alias_de_cada_fragmento():
    fragmentos = asignar_alias(
        [ChunkPuntuado("ch-1", "doc-1", "texto del fragmento", 0.9)]
    ).fragmentos

    prompt = construir_prompt_rag_query("¿pregunta?", "mama; HER2 positivo", fragmentos, "es")

    assert "¿pregunta?" in prompt
    assert "mama; HER2 positivo" in prompt
    assert "[fragmento C1]" in prompt
    assert "ch-1" not in prompt
    assert "texto del fragmento" in prompt
    assert "español" in prompt


def test_prompt_conserva_las_llaves_del_texto_de_un_fragmento_sin_interpretarlas():
    fragmentos = asignar_alias(
        [ChunkPuntuado("ch-1", "doc-1", "valor {idioma} y {0}", 0.9)]
    ).fragmentos

    prompt = construir_prompt_rag_query("p", "", fragmentos, "en")

    assert "valor {idioma} y {0}" in prompt
    assert "inglés" in prompt


def _procedencia(**cambios) -> dict:
    return {
        "entryMethod": "seed",
        "extractionConfidence": "n_a",
        "reviewStatus": "verificado",
        "conflict": False,
        **cambios,
    }


def _contexto_de_fx_t1a_a(*, ki67: str, er_en_conflicto: bool = False) -> ClinicalContext:
    """Contexto sintético: todo `verificado` salvo el Ki-67 `20 %` (estado dado) y, si se pide, el receptor de estrógeno `90 %`."""
    datos = solicitud_de()["clinicalContext"]
    datos["diagnosis"]["provenance"] = _procedencia()
    datos["biomarkers"] = [
        {**b, "provenance": _procedencia()} for b in datos["biomarkers"] if b["dataRef"] != "r3"
    ]
    datos["biomarkers"].append(
        {
            "dataRef": "r5",
            "biomarkerName": "Ki-67",
            "value": "20 %",
            "resultType": "cuantitativo",
            "clinicalSignificance": "relevante",
            "monthsAgo": 1,
            "provenance": _procedencia(entryMethod="ocr", reviewStatus=ki67),
        }
    )
    datos["biomarkers"].append(
        {
            "dataRef": "r6",
            "biomarkerName": "Receptor de estrógeno",
            "value": "90 %",
            "resultType": "cuantitativo",
            "clinicalSignificance": "relevante",
            "monthsAgo": 1,
            "provenance": _procedencia(
                reviewStatus="requiere_revision" if er_en_conflicto else "verificado",
                conflict=er_en_conflicto,
            ),
        }
    )
    return ClinicalContext.model_validate(datos)


@pytest.mark.ac("US-065", 5)
def test_bloque_de_datos_acompana_el_ki67_con_sin_verificar_cuando_requiere_revision():
    contexto = _contexto_de_fx_t1a_a(ki67="requiere_revision")

    lineas = bloque_de_datos_del_paciente(contexto).splitlines()

    etiquetadas = [
        linea for linea in lineas if "(sin verificar)" in linea or "(en conflicto)" in linea
    ]
    assert len(etiquetadas) == 1
    assert "Ki-67 20 %" in etiquetadas[0]
    assert "(sin verificar)" in etiquetadas[0]
