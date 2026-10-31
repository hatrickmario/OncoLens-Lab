"""El prompt de `/rag/query` pide afirmaciones atómicas por papel, en positivo y sin la atribución (US-245 AC-1)."""

from app.prompts.rag_query import construir_prompt_rag_query


def test_el_prompt_pide_el_rango_de_afirmaciones_y_el_maximo_de_palabras_configurados() -> None:
    prompt = construir_prompt_rag_query("pregunta", "contexto", [], "es", 2, 3, 15)

    assert '"claims": de 2 a 3 afirmaciones' in prompt
    assert "de 15 palabras como máximo" in prompt


def test_el_prompt_define_los_tres_papeles_y_exige_una_sola_principal() -> None:
    prompt = construir_prompt_rag_query("pregunta", "contexto", [], "es")

    assert 'exactamente una "principal"' in prompt
    assert '"secundaria"' in prompt and '"salvedad"' in prompt


def test_el_prompt_deja_la_atribucion_al_sistema_y_no_pide_detalles_libres() -> None:
    prompt = construir_prompt_rag_query("pregunta", "contexto", [], "es")

    assert "el sistema añade la atribución" in prompt
    assert '"details"' not in prompt and '"citedFragments"' not in prompt
