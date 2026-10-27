"""Arnés de subproceso (solo tests, US-117b): ``ingest reindex-sparse`` sobre el Milvus REAL de test con un *sparse* falso y un
fallo inyectado al reescribir el lote ``REINDEX_FALLA_EN_EL_LOTE`` (1 = el primero), cuyo mensaje trae la URI de Milvus.

    python -m tests.support.reindex_con_milvus_que_falla

El código de salida y los flujos son los de ``app.scripts.ingest.main``; aquí solo se inyecta lo que el proceso real toma de los
adapters de modelos (no hay pesos en la CI) y el fallo. Nunca se usa fuera de los tests.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator, Mapping, Sequence

from pymilvus import MilvusClient

from app.application.corpus_ingestion.ports import ChunkParaReindexar
from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import MilvusRepository
from app.scripts import ingest
from tests.support.ingesta import CodificadorSparseFalso


class _MilvusQueFalla:
    def __init__(self, real: MilvusRepository, lote_que_falla: int, uri: str) -> None:
        self._real, self._lote_que_falla, self._uri, self._llamadas = real, lote_que_falla, uri, 0

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]:
        return self._real.listar_vigentes_paginado(lote)

    def reescribir_sparse(
        self, chunks: Sequence[ChunkParaReindexar], vectores_sparse: Sequence[Mapping[int, float]]
    ) -> int:
        self._llamadas += 1
        if self._llamadas == self._lote_que_falla:
            raise ConnectionError(f"no se pudo escribir en {self._uri}")
        return self._real.reescribir_sparse(chunks, vectores_sparse)


def main() -> int:
    ajustes = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
    real = MilvusRepository(MilvusClient(uri=ajustes.milvus_uri), ajustes)
    real.ensure_collection()
    falla = _MilvusQueFalla(real, int(os.environ["REINDEX_FALLA_EN_EL_LOTE"]), ajustes.milvus_uri)
    return ingest.main(["reindex-sparse"], sparse=CodificadorSparseFalso(), almacen_sparse=falla)


if __name__ == "__main__":
    sys.exit(main())
