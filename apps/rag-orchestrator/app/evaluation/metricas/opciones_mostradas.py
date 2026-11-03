"""Métricas de la familia `opciones` (US-140). Esqueleto: se implementa con el verde de los AC."""

from __future__ import annotations

from dataclasses import dataclass

from app.evaluation.metricas.orden_opciones import OpcionOrdenable


@dataclass(frozen=True)
class OpcionMostrada:
    id: str
    documentos: tuple[str, ...]
    cita_a_chunk_entregado: bool
    soporte_nli: bool
    ordenable: OpcionOrdenable


@dataclass(frozen=True)
class AnalisisDeOpciones:
    caso: str
    revisada: bool
    opciones: tuple[OpcionMostrada, ...]
    esperadas: tuple[str, ...]
    espera_no_comparable: bool
    campos_nivel_a: int
    campos_nivel_b: int
    campos_con_termino: tuple[tuple[str, str], ...]
