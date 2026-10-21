"""El prompt de `/rag/query` pide el detalle expandible sin conocimiento externo ni lenguaje prescriptivo (ARR-08 AC-1)."""

from app.prompts.rag_query import construir_prompt_rag_query


def test_el_prompt_pide_hasta_el_maximo_de_parrafos_en_details_describiendo_solo_lo_que_reportan_los_fragmentos() -> (
    None
):
    prompt = construir_prompt_rag_query("pregunta", "contexto", [], "es", max_parrafos_detalle=2)

    assert '"details"' in prompt
    assert "hasta 2 párrafos" in prompt
