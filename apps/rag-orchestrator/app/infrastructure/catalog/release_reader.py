"""Lector de la release vigente del corpus (schema `corpus`, rol `rag_corpus`): implementa `CorpusReleaseReader`."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import Engine

from app.application.ports import ReleaseDelCorpus
from app.infrastructure.catalog.tables import corpus_release


class CorpusSinReleaseError(RuntimeError):
    """El catálogo no tiene ninguna `CorpusRelease` publicada: no hay corte ni fuentes excluidas que declarar."""


class LectorReleasePostgres:
    """Solo lectura sobre ``corpus.corpus_release``; el motor ya fija ``search_path=corpus`` (`crear_motor`)."""

    def __init__(self, motor: Engine) -> None:
        self._motor = motor

    def release_vigente(self) -> ReleaseDelCorpus:
        """La release publicada más reciente (``published_at``, desempate por ``release_id`` para ser determinista)."""
        consulta = (
            sa.select(corpus_release)
            .order_by(corpus_release.c.published_at.desc(), corpus_release.c.release_id.desc())
            .limit(1)
        )
        with self._motor.connect() as conexion:
            fila = conexion.execute(consulta).mappings().first()
        if fila is None:
            raise CorpusSinReleaseError("corpus.corpus_release no tiene ninguna release publicada")
        return ReleaseDelCorpus(
            release_id=fila["release_id"],
            cutoff_date=fila["cutoff_date"],
            excluded_sources=fuentes_excluidas_de(fila["excluded_sources"]),
        )


def fuentes_excluidas_de(texto: str) -> tuple[str, ...]:
    """``excluded_sources`` es texto con las fuentes separadas por comas (data-model §4.6)."""
    return tuple(fuente.strip() for fuente in texto.split(",") if fuente.strip())
