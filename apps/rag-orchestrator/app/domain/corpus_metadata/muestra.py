"""Selección reproducible de la muestra de metadatos para revisión humana (TBD-20, M-08.4)."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Sequence
from fractions import Fraction


class PorcentajeDeMuestraInvalido(ValueError):
    """``CORPUS_METADATA_SAMPLE_PCT`` fuera de [0, 100]."""


def seleccionar_muestra(document_ids: Sequence[str], pct: float, semilla: str) -> tuple[str, ...]:
    """``ceil(N * pct / 100)`` documentos, ordenados por ``sha256(semilla + document_id)``; independiente del orden de entrada.

    Con la misma semilla y los mismos documentos se eligen siempre los mismos, en el mismo orden. El redondeo es exacto
    (sin coma flotante): 30 documentos al 10 % son 3, no 4.
    """
    if not 0 <= pct <= 100:
        raise PorcentajeDeMuestraInvalido(str(pct))
    unicos = sorted(set(document_ids), key=lambda i: _huella(semilla, i))
    tamano = math.ceil(Fraction(str(pct)) * len(unicos) / 100)
    return tuple(unicos[:tamano])


def _huella(semilla: str, document_id: str) -> tuple[str, str]:
    return hashlib.sha256((semilla + document_id).encode("utf-8")).hexdigest(), document_id
