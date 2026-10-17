"""Crea (o verifica) la colección ``corpus_chunks`` de Milvus (US-058, D6).

    python -m app.scripts.init_corpus_store

Idempotente. Sin credenciales de PostgreSQL: solo ``MILVUS_*``, ``EMBEDDING_DIM`` y el índice de ADR-39. Lo ejecuta el
arranque de ``rag-orchestrator`` (el *hook* exacto lo coordina L1D-164) y la CI antes de los tests de integración.
Salida: solo colección y resultado, nunca URIs, credenciales ni contenido.
"""

from __future__ import annotations

import sys

from pydantic import ValidationError
from pymilvus import MilvusClient

from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import CorpusCollectionSchemaMismatch, MilvusRepository


def inicializar(cliente: MilvusClient, ajustes: MilvusSettings) -> bool:
    """``True`` si creó la colección, ``False`` si ya existía con el esquema esperado."""
    return MilvusRepository(cliente, ajustes).ensure_collection()


def main() -> int:
    try:
        ajustes = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        claves = ", ".join(str(e["loc"][0]).upper() for e in error.errors())
        print(f"init_corpus_store: configuración inválida en: {claves}", file=sys.stderr)
        return 1
    try:
        creada = inicializar(MilvusClient(uri=ajustes.milvus_uri), ajustes)
    except CorpusCollectionSchemaMismatch as error:
        print(
            f"init_corpus_store: {ajustes.milvus_collection_name} no coincide con el esquema: {error}",
            file=sys.stderr,
        )
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de pymilvus puede incluir la URI
        print(f"init_corpus_store: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    estado = "creada" if creada else "ya existía con el esquema esperado"
    print(f"init_corpus_store: colección {ajustes.milvus_collection_name} {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
