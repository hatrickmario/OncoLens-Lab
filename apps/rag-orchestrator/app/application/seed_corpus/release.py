"""Publicación del ``CorpusRelease`` al terminar una carga: compartida por la semilla y la ingesta en lote."""

from __future__ import annotations

from datetime import date

from app.application.ports import Clock
from app.application.seed_corpus.ports import CorpusCatalog, IdGenerator, RegistroDeRelease
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.versionado import debe_publicar_release


def publicar_release_si_cambio_el_conjunto_vigente(
    catalogo: CorpusCatalog,
    ids: IdGenerator,
    reloj: Clock,
    politica: PoliticaDeLicencias,
    fecha_de_corte: date,
) -> str | None:
    """El id de la release publicada, o ``None`` si el conjunto vigente no cambió respecto de la última."""
    vigentes = catalogo.ids_de_documentos_vigentes()
    if not debe_publicar_release(vigentes, catalogo.ids_de_la_ultima_release()):
        return None
    release_id = ids.nuevo()
    catalogo.publicar_release(
        RegistroDeRelease(
            release_id=release_id,
            cutoff_date=fecha_de_corte,
            excluded_sources=politica.fuentes_excluidas(),
            published_at=reloj.ahora(),
            document_ids=tuple(sorted(vigentes)),
        )
    )
    return release_id
