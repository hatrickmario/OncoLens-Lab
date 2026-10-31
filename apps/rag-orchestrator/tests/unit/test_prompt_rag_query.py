"""Plantilla del prompt `rag-query@0.1.0` (L1D-275, tarea 2.8): RN-23, `[S1 resp. 15]`, `[S1 resp. 34]`."""

import re
from pathlib import Path

import pytest

from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.domain.alias_de_chunks import asignar_alias
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import (
    ETIQUETA_EN_CONFLICTO,
    ETIQUETA_SIN_VERIFICAR,
    PLANTILLA_RAG_QUERY,
    VERSION_DEL_PROMPT,
    bloque_de_datos_del_paciente,
    construir_prompt_rag_query,
    datos_del_contexto,
    etiqueta_de_procedencia,
)
from app.schemas.generated.models import ClinicalContext, Provenance
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


def test_plantilla_avisa_de_los_modales_normativos_y_pide_parafrasear_los_requisitos_en_indicativo():
    """D4-20: las afirmaciones con modal normativo se retiran; el prompt lo advierte para que el modelo describa en indicativo."""
    texto = " ".join(PLANTILLA_RAG_QUERY.split())

    assert "modal" in texto
    assert "indicativo" in texto


def test_version_del_prompt_es_rag_query_0_6_0_porque_avisa_de_los_modales_normativos():
    assert VERSION_DEL_PROMPT == "rag-query@0.6.0"


def test_prompt_incluye_pregunta_contexto_y_alias_de_cada_fragmento():
    fragmentos = asignar_alias(
        [ChunkPuntuado("ch-1", "doc-1", "texto del fragmento", 0.9)]
    ).fragmentos

    prompt = construir_prompt_rag_query(
        "¿pregunta?",
        "mama; HER2 positivo",
        fragmentos,
        "es",
        claims_min=1,
        claims_max=4,
        claim_max_words=20,
    )

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

    prompt = construir_prompt_rag_query(
        "p", "", fragmentos, "en", claims_min=1, claims_max=4, claim_max_words=20
    )

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


@pytest.mark.ac("US-065", 5)
def test_bloque_de_datos_etiqueta_en_conflicto_y_no_sin_verificar_cuando_conflict_es_true():
    contexto = _contexto_de_fx_t1a_a(ki67="verificado", er_en_conflicto=True)

    lineas = bloque_de_datos_del_paciente(contexto).splitlines()

    etiquetadas = [linea for linea in lineas if "Receptor de estrógeno 90 %" in linea]
    assert etiquetadas == ["- Receptor de estrógeno 90 % (en conflicto)"]
    assert not any("(sin verificar)" in linea for linea in lineas)


def test_bloque_de_datos_no_etiqueta_ningun_dato_cuando_todos_estan_verificados():
    contexto = _contexto_de_fx_t1a_a(ki67="verificado")

    bloque = bloque_de_datos_del_paciente(contexto)

    assert "(sin verificar)" not in bloque
    assert "(en conflicto)" not in bloque
    assert "- Ki-67 20 %" in bloque.splitlines()


def test_etiqueta_de_procedencia_es_none_cuando_el_dato_es_auto_aceptado():
    procedencia = Provenance.model_validate(_procedencia(reviewStatus="auto_aceptado"))

    assert etiqueta_de_procedencia(procedencia) is None


@pytest.mark.ac("US-065", 5)
def test_bloque_de_datos_omite_atributos_y_eventos_aunque_esten_sin_verificar():
    datos = _contexto_de_fx_t1a_a(ki67="verificado").model_dump(mode="json")
    sin_verificar = _procedencia(reviewStatus="requiere_revision")
    datos["attributes"] = [
        {
            "dataRef": "r7",
            "key": "ATRIBUTO-X",
            "value": "valor-a",
            "monthsAgo": 1,
            "provenance": sin_verificar,
        }
    ]
    datos["events"][0]["description"] = "EVENTO-X"
    datos["events"][0]["provenance"] = sin_verificar

    bloque = bloque_de_datos_del_paciente(ClinicalContext.model_validate(datos))

    assert "ATRIBUTO-X" not in bloque
    assert "EVENTO-X" not in bloque
    assert "(sin verificar)" not in bloque


@pytest.mark.ac("US-065", 5)
def test_resumen_del_contexto_es_identico_cuando_el_ki67_esta_sin_verificar_y_cuando_esta_verificado():
    sin_verificar = _contexto_de_fx_t1a_a(ki67="requiere_revision", er_en_conflicto=True)
    verificado = _contexto_de_fx_t1a_a(ki67="verificado", er_en_conflicto=True)

    resumen = resumen_del_contexto_clinico(sin_verificar)

    assert resumen == resumen_del_contexto_clinico(verificado)
    assert "(sin verificar)" not in resumen
    assert "(en conflicto)" not in resumen


def test_bloque_de_datos_sin_etiquetas_coincide_con_el_resumen_embebido_cuando_se_une_con_punto_y_coma():
    contexto = _contexto_de_fx_t1a_a(ki67="requiere_revision", er_en_conflicto=True)

    textos = [texto for texto, _ in datos_del_contexto(contexto)]

    assert "; ".join(textos) == resumen_del_contexto_clinico(contexto)
    lineas = bloque_de_datos_del_paciente(contexto).splitlines()
    assert all(linea.startswith(f"- {texto}") for linea, texto in zip(lineas, textos, strict=True))


def test_plantilla_explica_las_mismas_etiquetas_que_el_bloque_emite():
    prompt = construir_prompt_rag_query(
        "p", "- dato", [], "es", claims_min=1, claims_max=4, claim_max_words=20
    )

    encabezado = next(
        linea for linea in prompt.splitlines() if linea.startswith("Datos del paciente")
    )
    assert ETIQUETA_SIN_VERIFICAR in encabezado
    assert ETIQUETA_EN_CONFLICTO in encabezado


@pytest.mark.ac("US-065", 5)
def test_prompt_con_datos_etiquetados_no_contiene_terminos_prohibidos_ni_identificadores():
    contexto = _contexto_de_fx_t1a_a(ki67="requiere_revision", er_en_conflicto=True)
    fragmentos = asignar_alias(
        [ChunkPuntuado("ch-1", "doc-1", "texto del fragmento", 0.9)]
    ).fragmentos

    prompt = construir_prompt_rag_query(
        "¿Qué opciones describe la evidencia?",
        bloque_de_datos_del_paciente(contexto),
        fragmentos,
        "es",
        claims_min=1,
        claims_max=4,
        claim_max_words=20,
    )

    assert "(sin verificar)" in prompt
    assert "(en conflicto)" in prompt
    assert check_prohibited_terms(prompt, _lista(), niveles=("A", "B")) == []
    assert contexto.pseudoPatientId not in prompt
    assert contexto.diagnosis is not None
    referencias = [contexto.diagnosis.dataRef.root, *(b.dataRef.root for b in contexto.biomarkers)]
    for referencia in referencias:
        assert re.search(rf"\b{re.escape(referencia)}\b", prompt) is None
