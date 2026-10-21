"""Lector del manifiesto de la semilla (``data/raw/seed/manifest.yaml``, US-059 D9).

Valida la FORMA del manifiesto antes de tocar PostgreSQL o Milvus: un manifiesto mal formado no carga nada. Lo que el
manifiesto declara de licencia o de fuente se juzga después en el dominio (``evaluar_admisibilidad``); aquí un documento
sin licencia es válido (se rechazará con motivo ``sin_licencia``), pero uno sin título o con un ``study_design`` fuera
del catálogo no lo es.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit
from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from app.infrastructure.catalog.tables import DOMINIOS_CERRADOS

# Claves de auditoría de la licencia (ADR-36: verificada documento por documento): se conservan en el manifiesto pero el
# cargador no las usa.
CLAVES_DE_AUDITORIA = frozenset(
    {"license_verified_at", "license_evidence", "attribution", "notes", "downloaded_at"}
)
PATRON_DE_CHECKSUM = re.compile(r"[0-9a-f]{64}")
CLAVES_OBLIGATORIAS = frozenset(
    {
        "document_key",
        "source_type",
        "source_name",
        "external_id",
        "title",
        "language",
        "cancer_type_tags",
        "published_at",
        "study_design",
        "population",
        "original_format",
    }
)
CLAVES_OPCIONALES = frozenset(
    {
        "version_group_id",
        "license",
        "license_url",
        "nc_solo_academico",
        "population_criteria",
        "version_label",
        "guideline_version",
        "trial_phase",
        "primary_endpoint",
        "sample_size",
        "last_updated_at",
        "checksum",
        "text",
        "text_path",
        "source_url",
        "original_url",
    }
)
CLAVES_DE_TEXTO = ("text", "text_path", "source_url")
PATRON_DE_CLAVE = re.compile(r"[A-Za-z0-9._-]{1,80}")


class ManifiestoInvalido(ValueError):
    """El manifiesto no se puede cargar; el mensaje nombra el documento y el campo, nunca contenido."""


def leer_manifiesto(ruta: Path) -> tuple[DocumentoDeSemilla, ...]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise ManifiestoInvalido(
            f"no se puede leer el manifiesto ({type(error).__name__})"
        ) from error
    crudos = contenido.get("documentos") if isinstance(contenido, dict) else None
    if not isinstance(crudos, list) or not crudos:
        raise ManifiestoInvalido("el manifiesto debe listar 'documentos'")
    documentos = tuple(_documento(crudo, posicion) for posicion, crudo in enumerate(crudos, 1))
    claves = [d.document_key for d in documentos]
    repetidas = sorted({k for k in claves if claves.count(k) > 1})
    if repetidas:
        raise ManifiestoInvalido(f"document_key repetido: {', '.join(repetidas)}")
    return documentos


def _documento(crudo: Any, posicion: int) -> DocumentoDeSemilla:
    if not isinstance(crudo, dict):
        raise ManifiestoInvalido(f"documento #{posicion}: debe ser un mapa")
    candidata = crudo.get("document_key")
    valida = isinstance(candidata, str) and PATRON_DE_CLAVE.fullmatch(candidata) is not None
    # Un document_key mal formado puede traer un secreto pegado por error: no se repite en ningún mensaje.
    clave = candidata if valida else f"documento #{posicion}"
    _comprobar_claves(crudo, clave)
    if not valida:
        raise ManifiestoInvalido(f"{clave}: document_key debe cumplir {PATRON_DE_CLAVE.pattern}")
    _validar_valores(crudo, clave)
    return DocumentoDeSemilla(
        document_key=clave,
        version_group_id=str(crudo.get("version_group_id") or clave),
        source_type=crudo["source_type"],
        source_name=_texto(crudo, "source_name", clave),
        external_id=_texto(crudo, "external_id", clave),
        title=_texto(crudo, "title", clave),
        language=crudo["language"],
        cancer_type_tags=tuple(crudo["cancer_type_tags"]),
        published_at=_fecha(crudo["published_at"], "published_at", clave),
        study_design=crudo["study_design"],
        population=crudo["population"],
        original_format=crudo["original_format"],
        license=_opcional(crudo.get("license")),
        license_url=_opcional(crudo.get("license_url")),
        nc_solo_academico=crudo.get("nc_solo_academico") is True,
        population_criteria=_criterios(crudo.get("population_criteria"), clave),
        version_label=_opcional(crudo.get("version_label")),
        guideline_version=_opcional(crudo.get("guideline_version")),
        trial_phase=crudo.get("trial_phase"),
        primary_endpoint=_opcional(crudo.get("primary_endpoint")),
        sample_size=crudo.get("sample_size"),
        last_updated_at=_fecha_opcional(crudo.get("last_updated_at"), "last_updated_at", clave),
        checksum_esperado=_checksum(crudo.get("checksum"), clave),
        texto=crudo.get("text"),
        ruta_texto=crudo.get("text_path"),
        url_fuente=crudo.get("source_url"),
        url_original=_url_https(crudo.get("original_url"), clave),
    )


def _validar_valores(crudo: Mapping[str, Any], clave: str) -> None:
    """Valores dentro de los catálogos cerrados del esquema, etiquetas bien formadas y exactamente un origen de texto."""
    for campo in ("source_type", "language", "population", "study_design", "original_format"):
        if crudo[campo] not in DOMINIOS_CERRADOS[campo]:
            raise ManifiestoInvalido(f"{clave}: {campo} fuera del catálogo")
    if crudo.get("trial_phase") not in (None, *DOMINIOS_CERRADOS["trial_phase"]):
        raise ManifiestoInvalido(f"{clave}: trial_phase fuera del catálogo")
    etiquetas = crudo["cancer_type_tags"]
    if (
        not isinstance(etiquetas, list)
        or not etiquetas
        or not all(isinstance(e, str) for e in etiquetas)
    ):
        raise ManifiestoInvalido(f"{clave}: cancer_type_tags debe ser una lista de textos")
    textos = [campo for campo in CLAVES_DE_TEXTO if crudo.get(campo)]
    if len(textos) != 1:
        raise ManifiestoInvalido(
            f"{clave}: declara exactamente uno de {', '.join(CLAVES_DE_TEXTO)}"
        )


def _comprobar_claves(crudo: Mapping[str, Any], clave: str) -> None:
    faltan = sorted(CLAVES_OBLIGATORIAS - crudo.keys())
    sobran = sorted(crudo.keys() - CLAVES_OBLIGATORIAS - CLAVES_OPCIONALES - CLAVES_DE_AUDITORIA)
    if faltan:
        raise ManifiestoInvalido(f"{clave}: faltan {', '.join(faltan)}")
    if sobran:
        raise ManifiestoInvalido(f"{clave}: claves desconocidas {', '.join(sobran)}")


def _texto(crudo: Mapping[str, Any], campo: str, clave: str) -> str:
    valor = crudo[campo]
    if not isinstance(valor, str) or not valor.strip():
        raise ManifiestoInvalido(f"{clave}: {campo} no puede estar vacío")
    return valor.strip()


def _opcional(valor: Any) -> str | None:
    return valor.strip() if isinstance(valor, str) and valor.strip() else None


def _url_https(valor: Any, clave: str) -> str | None:
    """URL pública del documento original: solo ``https`` con host (la UI la abre en una pestaña nueva)."""
    if valor is None:
        return None
    partes = urlsplit(valor) if isinstance(valor, str) else None
    if partes is None or partes.scheme != "https" or not partes.hostname:
        raise ManifiestoInvalido(f"{clave}: original_url debe ser una URL https con host")
    return valor.strip()


def _fecha(valor: Any, campo: str, clave: str) -> date:
    if isinstance(valor, date):
        return valor
    try:
        return date.fromisoformat(str(valor))
    except ValueError as error:
        raise ManifiestoInvalido(f"{clave}: {campo} no es una fecha ISO") from error


def _fecha_opcional(valor: Any, campo: str, clave: str) -> date | None:
    return None if valor is None else _fecha(valor, campo, clave)


def _checksum(valor: Any, clave: str) -> str | None:
    if valor is None:
        return None
    if not isinstance(valor, str) or not PATRON_DE_CHECKSUM.fullmatch(valor):
        raise ManifiestoInvalido(f"{clave}: checksum debe ser un SHA-256 hexadecimal en minúsculas")
    return valor


def _criterios(valor: Any, clave: str) -> dict[str, str] | None:
    if valor is None:
        return None
    if not isinstance(valor, dict) or not set(valor) <= set(CRITERIOS_DE_POBLACION):
        raise ManifiestoInvalido(
            f"{clave}: population_criteria admite solo {', '.join(CRITERIOS_DE_POBLACION)}"
        )
    return {k: str(v) for k, v in valor.items() if v not in (None, "")}
