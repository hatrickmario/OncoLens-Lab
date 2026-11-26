"""Variante ``llm`` del contexto del chunk (US-279 AC-4, L1D-337): RN-12, RN-21, RN-04.

Integración: el ``IngestionPipelineService`` real con el ``GeneradorLlmDeContexto`` real sobre un ``LlmClient`` guionado; se fingen solo los
bordes (LLM, embeddings, *sparse*, LLM de metadatos, NLI). Reloj e ids congelados. Sobre memoria y, donde existe el Compose de test,
PostgreSQL y Milvus reales.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import constructor_de_contexto
from app.application.corpus_ingestion.contexto_llm import GeneradorLlmDeContexto
from app.application.corpus_ingestion.reporte import Estado
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
    CONTEXTO_LLM_MAX_CHARS_INICIAL,
    CONTEXTO_MAX_CHARS_INICIAL,
    MetadatosDelContexto,
    VarianteDeContexto,
    contexto_determinista,
    inicio_del_documento,
)
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.contexto_llm import LlmDeContextoFalso, llm_caido, salida_de
from tests.support.ingesta import documentos_fx_06c_b, fragmentos_esperados_fx_06c_b
from tests.support.semilla import DIRECTORIO_DE_FIXTURES

DOCUMENTO = "i-gl-1"  # guía de mama de 3 chunks
FRASES = ("Primera frase.", "Segunda frase.", "Tercera frase.")


def _montaje(fabrica: Callable[..., Montaje], llm: LlmDeContextoFalso) -> Montaje:
    return fabrica(
        DIRECTORIO_DE_FIXTURES,
        constructor_de_contexto=constructor_de_contexto(
            VarianteDeContexto.LLM,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=GeneradorLlmDeContexto(llm=llm, max_chars=CONTEXTO_LLM_MAX_CHARS_INICIAL),
            doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
            concurrencia=1,
        ),
    )


def _prefijo_determinista() -> str:
    (documento,) = documentos_fx_06c_b(DOCUMENTO)
    return contexto_determinista(
        MetadatosDelContexto(documento.title, documento.source_type, "mama"),
        None,
        CONTEXTO_MAX_CHARS_INICIAL,
    )


@pytest.mark.ac("US-279", 4)
def test_ingesta_llm_hace_una_llamada_por_chunk_con_solo_el_documento_y_embebe_prefijo_frase_y_original(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-4] El LLM recibe 3 llamadas, cada una con metadatos y texto de ese documento; el texto que se embebe suma las tres partes."""
    llm = LlmDeContextoFalso([salida_de(f) for f in FRASES])
    montaje = _montaje(fabrica_de_montaje, llm)
    (documento,) = documentos_fx_06c_b(DOCUMENTO)
    originales = fragmentos_esperados_fx_06c_b(DOCUMENTO)[DOCUMENTO]

    reporte = montaje.servicio.ingerir([documento])

    inicio = inicio_del_documento(enumerate(originales), CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL)
    assert llm.invocaciones == 3
    for usuario, original in zip(llm.usuarios, originales, strict=True):
        assert documento.title in usuario and inicio in usuario and original in usuario
    assert montaje.embedder.textos_recibidos == [
        f"{_prefijo_determinista()}{frase}\n\n{original}"
        for frase, original in zip(FRASES, originales, strict=True)
    ]
    assert reporte.contadores_de_contexto() == {
        "respaldo_por_salida_invalida": 0,
        "respaldo_por_llm_no_disponible": 0,
    }


@pytest.mark.ac("US-279", 4)
def test_ingesta_llm_deja_el_chunk_con_el_contexto_determinista_cuando_la_salida_es_invalida_la_cuenta_y_el_documento_queda_embebido(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-4] Válida, inválida, válida: el segundo chunk lleva solo el contexto determinista y el resumen cuenta 1."""
    llm = LlmDeContextoFalso([salida_de(FRASES[0]), "esto no es json", salida_de(FRASES[2])])
    montaje = _montaje(fabrica_de_montaje, llm)
    (documento,) = documentos_fx_06c_b(DOCUMENTO)
    originales = fragmentos_esperados_fx_06c_b(DOCUMENTO)[DOCUMENTO]

    reporte = montaje.servicio.ingerir([documento])

    prefijo = _prefijo_determinista()
    assert montaje.embedder.textos_recibidos == [
        f"{prefijo}{FRASES[0]}\n\n{originales[0]}",
        f"{prefijo}{originales[1]}",
        f"{prefijo}{FRASES[2]}\n\n{originales[2]}",
    ]
    assert reporte.resultado_de(DOCUMENTO).estado is Estado.EMBEBIDO
    assert reporte.contadores_de_contexto() == {
        "respaldo_por_salida_invalida": 1,
        "respaldo_por_llm_no_disponible": 0,
    }
    assert montaje.filas_de(DOCUMENTO) == [("embebido", True)]
    assert montaje.textos_de_chunks(DOCUMENTO) == set(originales)


@pytest.mark.ac("US-279", 4)
def test_ingesta_llm_deja_los_tres_chunks_con_el_contexto_determinista_cuando_el_llm_no_esta_disponible(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-4] Con el LLM caído los 3 chunks se embeben con el determinista y se cuentan aparte de los de salida inválida."""
    llm = LlmDeContextoFalso([llm_caido(), llm_caido(), llm_caido()])
    montaje = _montaje(fabrica_de_montaje, llm)
    (documento,) = documentos_fx_06c_b(DOCUMENTO)
    originales = fragmentos_esperados_fx_06c_b(DOCUMENTO)[DOCUMENTO]

    reporte = montaje.servicio.ingerir([documento])

    assert montaje.embedder.textos_recibidos == [
        f"{_prefijo_determinista()}{o}" for o in originales
    ]
    assert reporte.resultado_de(DOCUMENTO).estado is Estado.EMBEBIDO
    assert reporte.contadores_de_contexto() == {
        "respaldo_por_salida_invalida": 0,
        "respaldo_por_llm_no_disponible": 3,
    }
