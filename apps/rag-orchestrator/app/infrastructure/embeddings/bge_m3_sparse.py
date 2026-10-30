"""Adapter *sparse* de BGE-M3 (US-117a D3, ADR-39): ``SparsePassageEncoder`` sobre la misma sesión de los *embeddings*.

El peso léxico de cada token es ``relu(sparse_linear(h))`` sobre el estado oculto ``h`` de ese token; la regla de qué
tokens cuentan y cómo se agrupan es de ``app/domain/pesos_sparse``. Comparte sesión y tokenizer con el
``PassageEmbedder``: el modelo se carga una sola vez. Un pasaje sin ningún término con peso es un fallo del puerto
(``FalloDeInferencia``): Milvus no admite un vector vacío y la ingesta no inserta un chunk sin *sparse*.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.ports import FalloDeInferencia
from app.domain.pesos_sparse import agrupar_pesos_por_token, pesos_lexicos
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto
from app.infrastructure.models.lotes import (
    agrupar_por_presupuesto_de_tokens,
    truncar_conservando_el_separador_final,
)
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador

_FALLO = "sparse: fallo de inferencia del modelo local"


class CodificadorSparseBgeM3:
    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        pesos: np.ndarray,
        sesgo: float,
        max_length: int,
        max_tokens_por_lote: int,
        prefijo_pasaje: str = "",
    ) -> None:
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._pesos = np.asarray(pesos, dtype=np.float32).reshape(-1)
        self._sesgo = float(sesgo)
        self._max_length = max_length
        self._max_tokens_por_lote = max_tokens_por_lote
        self._prefijo_pasaje = prefijo_pasaje

    def codificar(self, textos: Sequence[str]) -> list[dict[int, float]]:
        if not textos:
            return []
        with fallos_de_inferencia_como_error_del_puerto(_FALLO):
            secuencias = [
                truncar_conservando_el_separador_final(
                    self._tokenizador.codificar(self._prefijo_pasaje + t), self._max_length
                )
                for t in textos
            ]
            vectores: list[dict[int, float]] = [{} for _ in secuencias]
            for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
                oculto = self._sesion.ejecutar([secuencias[i] for i in lote])
                for fila, indice in enumerate(lote):
                    vectores[indice] = self._terminos(secuencias[indice], oculto[fila])
        if not all(vectores):
            raise FalloDeInferencia(_FALLO)
        return vectores

    def _terminos(self, ids: list[int], oculto: np.ndarray) -> dict[int, float]:
        if oculto.ndim != 2 or oculto.shape[0] < len(ids) or oculto.shape[1] != self._pesos.size:
            raise FalloDeInferencia(_FALLO)
        pesos = pesos_lexicos(oculto[: len(ids)], self._pesos, self._sesgo)
        return agrupar_pesos_por_token(ids, pesos.tolist())


class CodificadorSparseDeConsultaBgeM3:
    """``QuerySparseEncoder`` (US-112 D6): el MISMO codificador de la ingesta aplicado a la consulta.

    Reutiliza ``CodificadorSparseBgeM3`` (pesos, tokenizer, ``max_length`` y origen del vector) para que el índice y la
    consulta no puedan divergir; un texto sin ningún término con peso es un fallo del puerto, nunca un vector vacío.
    """

    def __init__(self, codificador: SparsePassageEncoder) -> None:
        self._codificador = codificador

    def embeber_sparse(self, texto: str) -> Mapping[int, float]:
        return self._codificador.codificar([texto])[0]
