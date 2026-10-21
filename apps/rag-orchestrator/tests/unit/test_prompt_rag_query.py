"""Plantilla del prompt `rag-query@0.1.0` (L1D-275, tarea 2.8): RN-23, `[S1 resp. 15]`, `[S1 resp. 34]`."""

from pathlib import Path

from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import (
    PLANTILLA_RAG_QUERY,
    VERSION_DEL_PROMPT,
    construir_prompt_rag_query,
)

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


def test_version_del_prompt_es_rag_query_0_2_0_porque_pide_el_detalle_de_cada_opcion():
    assert VERSION_DEL_PROMPT == "rag-query@0.2.0"


def test_prompt_incluye_pregunta_contexto_y_chunk_id_de_cada_fragmento():
    fragmentos = [ChunkPuntuado("ch-1", "doc-1", "texto del fragmento", 0.9)]

    prompt = construir_prompt_rag_query("¿pregunta?", "mama; HER2 positivo", fragmentos, "es")

    assert "¿pregunta?" in prompt
    assert "mama; HER2 positivo" in prompt
    assert "[chunkId: ch-1]" in prompt
    assert "texto del fragmento" in prompt
    assert "español" in prompt


def test_prompt_conserva_las_llaves_del_texto_de_un_fragmento_sin_interpretarlas():
    fragmentos = [ChunkPuntuado("ch-1", "doc-1", "valor {idioma} y {0}", 0.9)]

    prompt = construir_prompt_rag_query("p", "", fragmentos, "en")

    assert "valor {idioma} y {0}" in prompt
    assert "inglés" in prompt
