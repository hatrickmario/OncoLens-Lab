"""Documento del manifiesto de la semilla del corpus (US-059): valor inmutable que recorre el cargador.

No lleva I/O ni lee el texto: el contenido lo entrega un ``SourceFetcher`` y se normaliza aparte. Los campos son los que
el manifiesto declara; la licencia es el texto literal de la fuente (nunca inferido de la revista, ADR-36).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class DocumentoDeSemilla:
    document_key: str
    version_group_id: str
    source_type: str
    source_name: str
    external_id: str
    title: str
    language: str
    cancer_type_tags: tuple[str, ...]
    published_at: date
    study_design: str
    population: str
    original_format: str
    license: str | None = None
    license_url: str | None = None
    # Solo CC BY-NC: marca explícita de que el documento se usa únicamente en el MVP académico (RN-21).
    nc_solo_academico: bool = False
    # Criterios que la fuente publica de forma estructurada; ausente = la fuente no declara ninguno (RN-25).
    population_criteria: Mapping[str, str] | None = None
    version_label: str | None = None
    guideline_version: str | None = None
    trial_phase: str | None = None
    primary_endpoint: str | None = None
    sample_size: int | None = None
    last_updated_at: date | None = None
    # SHA-256 del texto normalizado que el manifiesto declara: si el texto leído da otro, no se indexa (integridad).
    checksum_esperado: str | None = None
    # Dónde está el texto: inline (solo fixtures), archivo junto al manifiesto o URL de un host permitido.
    texto: str | None = None
    ruta_texto: str | None = None
    url_fuente: str | None = None
    # URL pública del documento original de donde se extrajo el texto; se guarda en el catálogo y la UI la enlaza (RN-25).
    url_original: str | None = None
