"""Adapter de ``CorpusCatalog`` sobre el schema ``corpus`` (US-059, L1D-115). SQLAlchemy Core, rol ``rag_corpus`` (DML).

Nunca borra filas (RN-05): el histórico queda y solo cambia ``is_current``/``superseded_at``. Los errores de la base se
propagan sin traducir: el cargador los trata como fallo del catálogo y aborta.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Engine
from sqlalchemy.dialects.postgresql import insert

from app.application.seed_corpus.ports import RegistroDeDocumento, RegistroDeRelease
from app.domain.corpus_seed.versionado import VersionExistente
from app.infrastructure.catalog.tables import (
    corpus_document,
    corpus_release,
    corpus_release_document,
)


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
            conexion.execute(
                sa.update(corpus_document)
                .where(corpus_document.c.document_id == anterior_id)
                .values(is_current=False, superseded_at=superseded_at)
            )

    def ids_de_documentos_vigentes(self) -> frozenset[str]:
        consulta = sa.select(corpus_document.c.document_id).where(
            corpus_document.c.is_current.is_(True), corpus_document.c.status == "embebido"
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
            conexion.execute(
                sa.insert(corpus_release_document),
                [
                    {"release_id": release.release_id, "document_id": identificador}
                    for identificador in release.document_ids
                ],
            )

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
