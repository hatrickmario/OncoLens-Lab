"""Builders de filas del catálogo del corpus para los tests (US-059): solo datos sintéticos (RN-13, RN-14)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime

from app.application.seed_corpus.ports import RegistroDeDocumento

AHORA = datetime(2026, 10, 16, 12, 0, 0, tzinfo=UTC)


def registro_de_prueba(document_id: str = "doc-a@abcdef", **cambios: object) -> RegistroDeDocumento:
    base = RegistroDeDocumento(
        document_id=document_id,
        source_type="guideline",
        source_name="NCI",
        external_id="sintetico",
        title="Documento sintético",
        language="es",
        license="Texto de NCI libre de copyright",
        license_class="dominio_publico",
        license_url="https://www.cancer.gov/policies/copyright-reuse",
        open_access=True,
        cancer_type_tags="mama",
        population="adulto",
        study_design="guia",
        trial_phase=None,
        primary_endpoint=None,
        sample_size=None,
        population_criteria={"estadio": "no_disponible"},
        metadata_source="fuente_estructurada",
        guideline_version=None,
        last_updated_at=None,
        original_format="html",
        object_key_raw="",
        object_key_normalized="",
        checksum="a" * 64,
        version_group_id="doc-a",
        version_label="2025-01-15",
        is_current=True,
        superseded_at=None,
        published_at=date(2025, 1, 15),
        ingested_at=AHORA,
        last_checked_at=AHORA,
        status="embebido",
    )
    return replace(base, **cambios)  # type: ignore[arg-type]
