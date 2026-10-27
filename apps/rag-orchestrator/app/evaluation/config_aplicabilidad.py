"""Configuración de la familia `aplicabilidad` de `evaluate` (``eval/configs/test-aplicabilidad.yaml``, RN-22, US-132)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import (
    PROVEEDORES,
    RELOJES,
    ConfigInvalida,
    _clave,
    _en,
    _ruta_del_repo,
    huella_de_config,
)

META_COBERTURA = "cobertura_poblacion"
META_EXACTITUD = "exactitud_extraido_verificado"


@dataclass(frozen=True)
class ConfigAplicabilidad:
    nombre: str
    fixture: str
    dataset: Path
    reloj: str
    proveedor: str
    umbral_nli: float
    ruta_terminos: Path
    fecha_de_corte: date
    catalogo_en_memoria: Path | None
    revision: Path | None
    meta_cobertura: float
    meta_exactitud: float
    hash_config: str


def cargar_config_aplicabilidad(
    ruta: Path, fecha_de_corte: str | None = None
) -> ConfigAplicabilidad:
    """Carga la configuración; ``fecha_de_corte`` (``--corpus-cutoff-date``) sustituye a ``corpus.cutoff_date`` y entra
    en la huella. Los mensajes nombran la clave, nunca su valor."""
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    if not isinstance(crudo, dict):
        raise ConfigInvalida("la configuración no es un mapa YAML")
    if fecha_de_corte is not None:
        crudo = {**crudo, "corpus": {**(crudo.get("corpus") or {}), "cutoff_date": fecha_de_corte}}
    corpus = _clave(crudo, "corpus")
    metas = _clave(crudo, "metas")
    return ConfigAplicabilidad(
        nombre=str(_clave(crudo, "nombre")),
        fixture=str(_clave(crudo, "fixture")),
        dataset=_ruta_del_repo(str(_clave(crudo, "dataset", "ruta"))),
        reloj=_en(str(_clave(crudo, "medicion", "reloj")), RELOJES, "medicion.reloj"),
        proveedor=_en(
            str(_clave(crudo, "adaptadores", "proveedor")), PROVEEDORES, "adaptadores.proveedor"
        ),
        umbral_nli=_numero(_clave(crudo, "umbrales", "nli_entailment_threshold"), "umbrales"),
        ruta_terminos=_ruta_del_repo(str(_clave(crudo, "catalogo", "ruta_terminos"))),
        fecha_de_corte=_fecha(_clave(corpus, "cutoff_date")),
        catalogo_en_memoria=_ruta_opcional(corpus.get("catalogo_en_memoria")),
        revision=_ruta_opcional((crudo.get("corpus_metadatos") or {}).get("revision")),
        meta_cobertura=_meta(metas, META_COBERTURA),
        meta_exactitud=_meta(metas, META_EXACTITUD),
        hash_config=huella_de_config(crudo),
    )


def _ruta_opcional(valor: Any) -> Path | None:
    return _ruta_del_repo(str(valor)) if valor else None


def _numero(valor: Any, clave: str) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ConfigInvalida(f"la clave {clave} debe ser un número")
    return float(valor)


def _meta(metas: dict[str, Any], nombre: str) -> float:
    return _numero(_clave(metas, nombre, "minimo"), f"metas.{nombre}.minimo")


def _fecha(valor: Any) -> date:
    try:
        return valor if isinstance(valor, date) else date.fromisoformat(str(valor))
    except ValueError:
        raise ConfigInvalida("corpus.cutoff_date debe ser una fecha ISO (AAAA-MM-DD)") from None
