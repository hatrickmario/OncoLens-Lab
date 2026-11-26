"""El índice en memoria de un brazo de contexto del chunk (US-279 AC-5, D7): la fuente de la CI, con adapters falsos.

Cada brazo recalcula los vectores *dense* y *sparse* de los chunks del dataset sobre ``texto_a_embeber`` (la misma función de dominio de la
ingesta) y comparte con los demás brazos todo lo demás. El texto que devuelve la búsqueda y que se cita sigue siendo el del dataset
(RN-04): el prefijo solo existe como entrada del codificador. La medición con modelos locales no pasa por aquí: lee una colección de
Milvus por brazo (``indice.fuente: milvus``) y no vuelve a embeber el corpus.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from app.application.corpus_ingestion.constructores_de_contexto import constructor_de_contexto
from app.application.corpus_ingestion.ports import ConstructorDeContexto
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
    CONTEXTO_MAX_CHARS_INICIAL,
    MetadatosDelContexto,
    VarianteDeContexto,
)
from app.evaluation.adaptadores_falsos import BuscadorSparseEnMemoria, GeneradorDeContextoFalso
from app.evaluation.composicion_suite import Adaptadores, vector_sparse_o_vacio
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.fuente_dataset import DatasetSuite


@dataclass(frozen=True)
class IndiceConContexto:
    adaptadores: Adaptadores
    """Los adaptadores de la suite con los vectores de los chunks de ESTE brazo."""
    chunks: int
    respaldo_por_salida_invalida: int
    respaldo_por_llm_no_disponible: int


def _constructor_de_la_suite(variante: VarianteDeContexto) -> ConstructorDeContexto:
    """Los valores iniciales de dominio (RN-22) y, para ``llm``, el generador falso: sin ninguna llamada de red."""
    return constructor_de_contexto(
        variante,
        max_chars=CONTEXTO_MAX_CHARS_INICIAL,
        generador=GeneradorDeContextoFalso() if variante is VarianteDeContexto.LLM else None,
        doc_max_chars=CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
        concurrencia=1,
    )


def _indices_por_documento(dataset: DatasetSuite) -> dict[str, list[int]]:
    """Los índices de los chunks de cada documento, en el orden del dataset (que es el de cada documento)."""
    por_documento: dict[str, list[int]] = {}
    for indice, chunk in enumerate(dataset.chunks):
        por_documento.setdefault(chunk.documento, []).append(indice)
    return por_documento


def construir_indice_con_contexto(
    adaptadores: Adaptadores, dataset: DatasetSuite, variante: VarianteDeContexto
) -> IndiceConContexto:
    """Los textos a embeber de cada chunk según ``variante`` y los vectores *dense* y *sparse* calculados sobre ellos."""
    if adaptadores.codificador_sparse is None:
        raise ConfigInvalida("un brazo de contexto exige el codificador sparse de la suite")
    constructor = _constructor_de_la_suite(variante)
    metadatos = {d.id: MetadatosDelContexto(d.titulo, None, d.cancer) for d in dataset.documentos}
    textos = [chunk.texto for chunk in dataset.chunks]
    por_salida_invalida = por_llm_no_disponible = 0
    for documento, indices in _indices_por_documento(dataset).items():
        resultado = constructor.textos_a_embeber(
            metadatos.get(documento), [dataset.chunks[i].texto for i in indices]
        )
        for indice, texto in zip(indices, resultado.textos, strict=True):
            textos[indice] = texto
        por_salida_invalida += resultado.respaldo_por_salida_invalida
        por_llm_no_disponible += resultado.respaldo_por_llm_no_disponible
    sparse = [vector_sparse_o_vacio(adaptadores.codificador_sparse, t) for t in textos]
    return IndiceConContexto(
        replace(
            adaptadores,
            vectores_de_chunks=[adaptadores.embedder.embeber(t) for t in textos],
            buscador_sparse=BuscadorSparseEnMemoria(dataset, sparse),
        ),
        len(textos),
        por_salida_invalida,
        por_llm_no_disponible,
    )
