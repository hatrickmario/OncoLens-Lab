"""`POST /rag/query` sobre un índice construido con contexto del documento (US-279 / L1D-337): RN-04, RN-01, RN-02.

La ingesta real (``IngestionPipelineService`` con el constructor de la variante) escribe en un almacén en memoria; el texto que
quedó guardado de un chunk entra a la recuperación de ``/rag/query`` (corpus FX-06a-a, catálogo, reranker, generador y NLI falsos).
Cada respuesta se valida contra el spec del proveedor (hook de ``verificacion_proveedor.py``, US-214).
"""

from dataclasses import replace

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import constructor_de_contexto
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
    CONTEXTO_MAX_CHARS_INICIAL,
    VarianteDeContexto,
)
from tests.integration.corpus_ingestion.conftest import montar
from tests.support.contexto_llm import PREFIJO_DE_FRASE_DE_TEST, GeneradorDeContextoFalso
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.ingesta import fragmentos_esperados_fx_06c_b
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.recuperacion import (
    CORPUS_FX06A,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
    crear_entorno,
    solicitud_de,
)

TITULO_DE_I_GL_1 = "Guía sintética de mama"


def _entorno_con_el_chunk_ingerido(variante: VarianteDeContexto, nli: NliFalso):
    """``ch-m1-1`` pasa a ser el primer chunk de ``i-gl-1`` tal como la ingesta lo dejó en el almacén."""
    montaje = montar(
        constructor_de_contexto=constructor_de_contexto(
            variante,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=GeneradorDeContextoFalso(),
            doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
            concurrencia=1,
        )
    )
    montaje.ingerir()
    guardado = next(
        c
        for c in montaje.almacen.chunks.values()
        if c.document_id.startswith("i-gl-1@") and c.chunk_index == 0
    )
    corpus = tuple(
        replace(c, texto=guardado.chunk_text) if c.chunk_id == "ch-m1-1" else c
        for c in CORPUS_FX06A
    )
    entorno = crear_entorno(
        buscador=BuscadorFalso(corpus),
        generador=FakeEvidenceGenerator("LLM-OK"),
        clasificador_nli=nli,
    )
    return entorno, fragmentos_esperados_fx_06c_b("i-gl-1")["i-gl-1"][0]


@pytest.mark.ac("US-279", 2)
@pytest.mark.parametrize("variante", [VarianteDeContexto.DETERMINISTA, VarianteDeContexto.LLM])
def test_rag_query_cita_y_pasa_al_nli_el_texto_original_del_chunk_cuando_el_indice_se_construyo_con_contexto(
    variante: VarianteDeContexto,
) -> None:
    """[US-279 AC-2] La cita y la premisa del NLI son el texto original, sin el título ni la frase de contexto."""
    nli = NliFalso(por_defecto=IMPLICA)
    entorno, original = _entorno_con_el_chunk_ingerido(variante, nli)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cita = respuesta.json()["evidenceOptions"][0]["citedSources"][0]
    assert cita["chunkTextSnapshot"] == original
    assert [p.premisa for p in nli.pares_recibidos] == [original]
    assert TITULO_DE_I_GL_1 not in respuesta.text
    assert PREFIJO_DE_FRASE_DE_TEST not in respuesta.text


@pytest.mark.ac("US-279", 6)
def test_rag_query_responde_sin_evidencia_con_top_relevance_score_null_y_sin_llamar_al_generador_cuando_ningun_chunk_supera_el_umbral_en_un_indice_con_contexto() -> (
    None
):
    """[US-279 AC-6] RN-02: la variante de contexto no cambia la regla de «sin evidencia»."""
    entorno, _ = _entorno_con_el_chunk_ingerido(
        VarianteDeContexto.DETERMINISTA, NliFalso(por_defecto=IMPLICA)
    )

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0
