"""Contexto del documento en el texto que se embebe (US-279, L1D-337): aceptación de AC-1 y AC-3 sobre FX-06c-b.

Integración: el ``IngestionPipelineService`` real con el constructor de la variante; se fingen solo los bordes (embeddings, *sparse*,
LLM de metadatos, NLI). Reloj e ids congelados. Sobre memoria y, donde existe el Compose de test, PostgreSQL y Milvus reales.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import constructor_de_contexto
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_MAX_CHARS_INICIAL,
    VarianteDeContexto,
)
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.contexto_llm import GeneradorDeContextoFalso
from tests.support.ingesta import (
    DOCUMENTOS_ADMISIBLES_FX_06C_B,
    CodificadorSparseFalso,
    documentos_fx_06c_b,
    fragmentos_esperados_fx_06c_b,
)
from tests.support.semilla import DIRECTORIO_DE_FIXTURES, EmbedderFalso


def _originales_en_orden() -> list[str]:
    esperados = fragmentos_esperados_fx_06c_b()
    return [f for clave in DOCUMENTOS_ADMISIBLES_FX_06C_B for f in esperados[clave]]


@pytest.mark.ac("US-279", 3)
def test_ingesta_con_ninguno_da_a_los_codificadores_el_texto_original_y_deja_los_mismos_ids_y_vectores_que_main(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-3] Con ``ninguno`` el dense y el sparse reciben, byte a byte, el texto original y nada cambia respecto de main."""
    montaje = fabrica_de_montaje(
        DIRECTORIO_DE_FIXTURES,
        constructor_de_contexto=constructor_de_contexto(
            VarianteDeContexto.NINGUNO, max_chars=CONTEXTO_MAX_CHARS_INICIAL
        ),
    )

    montaje.ingerir()

    originales = _originales_en_orden()
    assert montaje.embedder.textos_recibidos == originales
    assert montaje.sparse.textos_recibidos == originales
    registros = montaje.registros_de_chunks()
    assert sorted(r.chunk_text for r in registros.values()) == sorted(originales)
    embedder, sparse = EmbedderFalso(), CodificadorSparseFalso()
    for registro in registros.values():
        assert registro.dense == pytest.approx(embedder.embeber([registro.chunk_text])[0])
        assert registro.sparse == pytest.approx(sparse.codificar([registro.chunk_text])[0])
    assert montaje.chunks_por_clave() == {
        clave: len(f) for clave, f in fragmentos_esperados_fx_06c_b().items()
    }


@pytest.mark.ac("US-279", 1)
def test_ingesta_determinista_embebe_el_titulo_el_tipo_de_fuente_y_el_cancer_antes_del_texto_sin_llamar_al_llm(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-279 AC-1] El texto que se embebe lleva título, tipo de fuente y tipo de cáncer, en ese orden, y el original al final."""
    espia = GeneradorDeContextoFalso()
    montaje = fabrica_de_montaje(
        DIRECTORIO_DE_FIXTURES,
        constructor_de_contexto=constructor_de_contexto(
            VarianteDeContexto.DETERMINISTA,
            max_chars=CONTEXTO_MAX_CHARS_INICIAL,
            generador=espia,
        ),
    )

    montaje.ingerir()

    por_documento = fragmentos_esperados_fx_06c_b()
    recibidos = iter(montaje.embedder.textos_recibidos)
    for documento in documentos_fx_06c_b(*DOCUMENTOS_ADMISIBLES_FX_06C_B):
        for original in por_documento[documento.document_key]:
            texto = next(recibidos)
            prefijo = texto.removesuffix(original)
            assert texto.endswith(original) and prefijo
            etiquetas = ", ".join(documento.cancer_type_tags)
            en_titulo = prefijo.index(documento.title)
            en_fuente = prefijo.index(documento.source_type, en_titulo + len(documento.title))
            assert en_titulo == 0 and en_fuente < prefijo.index(etiquetas, en_fuente)
            assert "No disponible" not in prefijo
    assert montaje.sparse.textos_recibidos == montaje.embedder.textos_recibidos
    assert espia.llamadas == []
