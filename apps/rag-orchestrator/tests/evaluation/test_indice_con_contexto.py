"""El índice en memoria de un brazo de contexto (US-279 AC-5, l1d-337 tarea 2.2): los vectores salen de ``texto_a_embeber`` de dominio y el
texto que se busca y se cita es el original (RN-04). Adapters falsos; sin red."""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.corpus_ingestion.ports import EntradaDelGeneradorDeContexto
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_MAX_CHARS_INICIAL,
    MetadatosDelContexto,
    VarianteDeContexto,
    contexto_determinista,
    texto_a_embeber,
)
from app.evaluation.adaptadores_falsos import (
    CodificadorSparseLexico,
    EmbedderBolsaDePalabras,
    GeneradorDeContextoFalso,
)
from app.evaluation.composicion_suite import Adaptadores, adaptadores_de_suite
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.fuente_dataset import (
    ChunkCorpus,
    DatasetSuite,
    DocumentoCorpus,
    FuenteDatasetEnDirectorio,
)
from app.evaluation.indice_con_contexto import construir_indice_con_contexto
from tests.evaluation.conftest import RAIZ_APP

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-contexto-fake.yaml"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}


def _mundo() -> tuple[DatasetSuite, Adaptadores]:
    config = cargar_config_suite(CONFIG, ENTORNO)
    base = FuenteDatasetEnDirectorio(config.dataset).cargar()
    dataset = replace(
        base,
        documentos=(
            DocumentoCorpus("d1", "Guía de mama", "mama"),
            DocumentoCorpus("d2", "Ensayo de próstata", "prostata"),
        ),
        chunks=(
            ChunkCorpus("d1-1", "d1", "terapia dirigida contra HER2 en mama temprana"),
            ChunkCorpus("d1-2", "d1", "quimioterapia adyuvante con antraciclinas"),
            ChunkCorpus("d2-1", "d2", "abiraterona con prednisona en cáncer resistente"),
        ),
    )
    return dataset, adaptadores_de_suite(config, dataset, None)


def _esperado(dataset: DatasetSuite, variante: VarianteDeContexto) -> list[list[float]]:
    titulos = {d.id: d for d in dataset.documentos}
    embedder = EmbedderBolsaDePalabras()
    textos = []
    for chunk in dataset.chunks:
        documento = titulos[chunk.documento]
        contexto = (
            contexto_determinista(
                MetadatosDelContexto(documento.titulo, None, documento.cancer),
                None,
                CONTEXTO_MAX_CHARS_INICIAL,
            )
            if variante is VarianteDeContexto.DETERMINISTA
            else ""
        )
        textos.append(texto_a_embeber(contexto, chunk.texto))
    return [list(embedder.embeber(t)) for t in textos]


def test_con_ninguno_los_vectores_son_los_del_texto_original() -> None:
    dataset, adaptadores = _mundo()

    construido = construir_indice_con_contexto(adaptadores, dataset, VarianteDeContexto.NINGUNO)

    assert [list(v) for v in construido.adaptadores.vectores_de_chunks] == _esperado(
        dataset, VarianteDeContexto.NINGUNO
    )
    assert construido.chunks == 3
    assert construido.respaldo_por_salida_invalida == construido.respaldo_por_llm_no_disponible == 0


def test_con_determinista_los_vectores_son_los_del_prefijo_con_el_titulo_y_el_cancer_mas_el_original() -> (
    None
):
    dataset, adaptadores = _mundo()

    construido = construir_indice_con_contexto(
        adaptadores, dataset, VarianteDeContexto.DETERMINISTA
    )

    esperado = _esperado(dataset, VarianteDeContexto.DETERMINISTA)
    assert [list(v) for v in construido.adaptadores.vectores_de_chunks] == esperado
    assert esperado != _esperado(dataset, VarianteDeContexto.NINGUNO)


def test_el_indice_sparse_del_brazo_se_calcula_sobre_el_mismo_texto_que_el_dense() -> None:
    dataset, adaptadores = _mundo()
    construido = construir_indice_con_contexto(
        adaptadores, dataset, VarianteDeContexto.DETERMINISTA
    )

    # una consulta que solo comparte la palabra del TÍTULO («Ensayo») recupera el chunk de ese documento por la rama sparse
    codificador = CodificadorSparseLexico()
    aciertos = construido.adaptadores.buscador_sparse.search_sparse(  # type: ignore[union-attr]
        codificador.embeber_sparse("ensayo"), limit=5
    )

    assert [a.chunk_id for a in aciertos] == ["d2-1"]


def test_el_texto_que_devuelve_la_busqueda_es_el_original_sin_prefijo() -> None:
    dataset, adaptadores = _mundo()
    construido = construir_indice_con_contexto(
        adaptadores, dataset, VarianteDeContexto.DETERMINISTA
    )
    codificador = CodificadorSparseLexico()

    (acierto,) = construido.adaptadores.buscador_sparse.search_sparse(  # type: ignore[union-attr]
        codificador.embeber_sparse("ensayo"), limit=5
    )

    assert acierto.chunk_text == "abiraterona con prednisona en cáncer resistente"


def test_con_llm_el_generador_falso_no_llama_a_nada_y_no_hay_respaldos() -> None:
    dataset, adaptadores = _mundo()

    construido = construir_indice_con_contexto(adaptadores, dataset, VarianteDeContexto.LLM)

    assert construido.respaldo_por_salida_invalida == construido.respaldo_por_llm_no_disponible == 0
    assert [list(v) for v in construido.adaptadores.vectores_de_chunks] != _esperado(
        dataset, VarianteDeContexto.DETERMINISTA
    )


def test_el_generador_falso_devuelve_una_frase_determinista_del_titulo_y_nunca_vacia() -> None:
    generador = GeneradorDeContextoFalso()
    entrada = EntradaDelGeneradorDeContexto(MetadatosDelContexto("Guía de mama", None, "mama"), "x")

    primera = generador.generar(entrada, "chunk")

    assert primera == generador.generar(entrada, "otro chunk")
    assert primera.frase and "Guía de mama" in primera.frase and primera.motivo is None
    assert generador.generar(EntradaDelGeneradorDeContexto(None, "x"), "c").frase


@pytest.mark.parametrize("variante", list(VarianteDeContexto))
def test_cada_variante_deja_un_vector_por_chunk_en_el_mismo_orden(
    variante: VarianteDeContexto,
) -> None:
    dataset, adaptadores = _mundo()

    construido = construir_indice_con_contexto(adaptadores, dataset, variante)

    assert len(construido.adaptadores.vectores_de_chunks) == len(dataset.chunks)
