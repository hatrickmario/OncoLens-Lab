"""Adapter de ``CorpusCatalog`` sobre el schema ``corpus`` (US-059, L1D-115). SQLAlchemy Core, rol ``rag_corpus`` (DML).

Nunca borra filas (RN-05): el histórico queda y solo cambia ``is_current``/``superseded_at``. Los errores de la base se
propagan sin traducir: el cargador los trata como fallo del catálogo y aborta.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import asdict
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Engine
from sqlalchemy.dialects.postgresql import insert

from app.application.seed_corpus.ports import (
    RegistroDeDocumento,
    RegistroDeRelease,
    VersionInexistente,
)
from app.domain.corpus_metadata.resultado import EXTRAIDO_VERIFICADO
from app.domain.corpus_seed.versionado import STATUS_EMBEBIDO, VersionExistente
from app.infrastructure.catalog.tables import (
    corpus_document,
    corpus_release,
    corpus_release_document,
)


def _registro_de(fila: Mapping[str, Any]) -> RegistroDeDocumento:
    """JSONB devuelve ``extracted_fields`` como lista: el registro lo expone como tupla inmutable."""
    return RegistroDeDocumento(**{**fila, "extracted_fields": tuple(fila["extracted_fields"])})


class CorpusDocumentRepository:
    def __init__(self, motor: Engine) -> None:
        self._motor = motor

    def versiones_del_grupo(self, version_group_id: str) -> list[VersionExistente]:
        consulta = sa.select(
            corpus_document.c.document_id,
            corpus_document.c.checksum,
            corpus_document.c.is_current,
            corpus_document.c.status,
        ).where(corpus_document.c.version_group_id == version_group_id)
        with self._motor.connect() as conexion:
            return [VersionExistente(*fila) for fila in conexion.execute(consulta)]

    def guardar_documento(self, registro: RegistroDeDocumento) -> None:
        with self._motor.begin() as conexion:
            self._guardar(conexion, registro)

    def reemplazar_version(
        self, nuevo: RegistroDeDocumento, anterior_id: str, superseded_at: datetime
    ) -> None:
        with self._motor.begin() as conexion:
            self._guardar(conexion, nuevo)
            apagadas = conexion.execute(
                sa.update(corpus_document)
                .where(corpus_document.c.document_id == anterior_id)
                .values(is_current=False, superseded_at=superseded_at)
            )
            if (
                apagadas.rowcount != 1
            ):  # dentro de la transacción: al lanzar se revierte también el nuevo
                raise VersionInexistente(anterior_id)

    def retirar_version(self, document_id: str, superseded_at: datetime) -> None:
        with self._motor.begin() as conexion:
            retiradas = conexion.execute(
                sa.update(corpus_document)
                .where(corpus_document.c.document_id == document_id)
                .values(is_current=False, superseded_at=superseded_at)
            )
            if retiradas.rowcount != 1:
                raise VersionInexistente(document_id)

    def ids_de_documentos_vigentes(self) -> frozenset[str]:
        consulta = sa.select(corpus_document.c.document_id).where(
            corpus_document.c.is_current.is_(True), corpus_document.c.status == STATUS_EMBEBIDO
        )
        with self._motor.connect() as conexion:
            return frozenset(conexion.execute(consulta).scalars())

    def ids_de_la_ultima_release(self) -> frozenset[str] | None:
        ultima = (
            sa.select(corpus_release.c.release_id)
            .order_by(corpus_release.c.published_at.desc(), corpus_release.c.release_id.desc())
            .limit(1)
        )
        with self._motor.connect() as conexion:
            identificador = conexion.execute(ultima).scalar()
            if identificador is None:
                return None
            documentos = sa.select(corpus_release_document.c.document_id).where(
                corpus_release_document.c.release_id == identificador
            )
            return frozenset(conexion.execute(documentos).scalars())

    def publicar_release(self, release: RegistroDeRelease) -> None:
        with self._motor.begin() as conexion:
            conexion.execute(
                sa.insert(corpus_release).values(
                    release_id=release.release_id,
                    cutoff_date=release.cutoff_date,
                    document_count=len(release.document_ids),
                    excluded_sources=json.dumps(list(release.excluded_sources), ensure_ascii=False),
                    published_at=release.published_at,
                )
            )
            if (
                release.document_ids
            ):  # una release sin documentos es válida (tras retirar el último vigente)
                conexion.execute(
                    sa.insert(corpus_release_document),
                    [
                        {"release_id": release.release_id, "document_id": identificador}
                        for identificador in release.document_ids
                    ],
                )

    def documentos_extraidos_de_la_release(self, release_id: str) -> list[RegistroDeDocumento]:
        consulta = (
            sa.select(corpus_document)
            .join(
                corpus_release_document,
                corpus_release_document.c.document_id == corpus_document.c.document_id,
            )
            .where(
                corpus_release_document.c.release_id == release_id,
                corpus_document.c.metadata_source == EXTRAIDO_VERIFICADO,
            )
            .order_by(corpus_document.c.document_id)
        )
        with self._motor.connect() as conexion:
            return [_registro_de(fila) for fila in conexion.execute(consulta).mappings()]

    @staticmethod
    def _guardar(conexion: sa.Connection, registro: RegistroDeDocumento) -> None:
        valores = asdict(registro)
        sentencia = insert(corpus_document).values(**valores)
        conexion.execute(
            sentencia.on_conflict_do_update(
                index_elements=[corpus_document.c.document_id],
                set_={k: v for k, v in valores.items() if k != "document_id"},
            )
        )
