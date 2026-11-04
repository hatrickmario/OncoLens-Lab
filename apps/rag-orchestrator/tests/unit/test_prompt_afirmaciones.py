"""El prompt de `/rag/query` pide afirmaciones atómicas por papel, en positivo y sin la atribución (US-245 AC-1)."""

from app.prompts.rag_query import construir_prompt_rag_query


def test_el_prompt_pide_el_rango_de_afirmaciones_y_el_maximo_de_palabras_configurados() -> None:
    prompt = construir_prompt_rag_query(
        "pregunta", "contexto", [], "es", claims_min=2, claims_max=3, claim_max_words=15
    )

    assert '"other_claims" (de 1 a 2 afirmaciones adicionales)' in prompt
    assert "de 15 palabras como máximo" in prompt


def test_el_prompt_define_la_afirmacion_central_y_los_dos_papeles_de_las_adicionales() -> None:
    prompt = construir_prompt_rag_query(
        "pregunta", "contexto", [], "es", claims_min=1, claims_max=4, claim_max_words=20
    )

    assert '"main_claim" (su afirmación central' in prompt
    assert '"secundaria"' in prompt and '"salvedad"' in prompt


def test_el_prompt_deja_la_atribucion_al_sistema_y_no_pide_detalles_libres() -> None:
    prompt = construir_prompt_rag_query(
        "pregunta", "contexto", [], "es", claims_min=1, claims_max=4, claim_max_words=20
    )

    assert "el sistema añade la atribución" in prompt
    assert '"details"' not in prompt and '"citedFragments"' not in prompt
