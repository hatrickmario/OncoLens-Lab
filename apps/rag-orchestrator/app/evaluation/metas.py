"""Metas iniciales de calidad y latencia (PRD §2.1, TBD-02) y la marca de cada métrica frente a ellas (US-073 AC-3, AC-4).

Las metas se leen de ``eval/configs/metas-iniciales.yaml``; este módulo nunca las escribe: fijarlas es DEC-07. Reglas puras.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

from app.evaluation.config_suite import ConfigInvalida

Estado = Literal["en meta", "fuera de meta", "sin medir"]


@dataclass(frozen=True)
class Meta:
    etiqueta: str
    minimo: float | None = None
    maximo: float | None = None

    def texto(self) -> str:
        if self.minimo is not None:
            return f"≥ {self.minimo:g}"
        return f"≤ {self.maximo:g}"


@dataclass(frozen=True)
class MetricaMarcada:
    clave: str
    etiqueta: str
    valor: float | None
    meta: str
    estado: Estado


def cargar_metas(ruta: Path) -> dict[str, Meta]:
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
        return {
            clave: Meta(str(m["etiqueta"]), m.get("minimo"), m.get("maximo"))
            for clave, m in crudo["metas"].items()
        }
    except (OSError, yaml.YAMLError, KeyError, TypeError, AttributeError):
        raise ConfigInvalida("las metas iniciales no se pudieron leer") from None


def _estado(valor: float | None, meta: Meta) -> Estado:
    if valor is None:
        return "sin medir"
    cumple = valor >= meta.minimo if meta.minimo is not None else valor <= (meta.maximo or 0.0)
    return "en meta" if cumple else "fuera de meta"


def marcar_frente_a_meta(
    metricas: Mapping[str, float | None], metas: Mapping[str, Meta]
) -> list[MetricaMarcada]:
    """Una marca por meta, en el orden de las metas; una métrica sin meta no se marca."""
    return [
        MetricaMarcada(
            clave,
            meta.etiqueta,
            metricas.get(clave),
            meta.texto(),
            _estado(metricas.get(clave), meta),
        )
        for clave, meta in metas.items()
    ]


def nota_adr42(p95_s: float | None, meta_s: float) -> str | None:
    """AC-3: un p95 sobre la meta se anota como insumo de ADR-42 (streaming de progreso); la meta no cambia."""
    if p95_s is None or p95_s <= meta_s:
        return None
    return (
        f"El p95 de punta a punta ({p95_s:g} s) supera la meta de {meta_s:g} s: "
        "se anota como insumo de ADR-42 (streaming de progreso); la meta no se modifica."
    )
