"""Medición de memoria del proceso con los tres modelos (US-231b AC-7, NFR-01, ADR-39).

Sin dependencias nuevas: ``resource.getrusage`` (pico) y, en Linux, ``/proc/self/statm`` (residente actual). Un exceso se
REPORTA con su cifra; nunca se oculta ni se ajusta el presupuesto.
"""

from __future__ import annotations

import os
import resource
import sys
from pathlib import Path
from typing import Any

BYTES_POR_MIB = 1024 * 1024
KIB_POR_MIB = 1024


def a_mib(ru_maxrss: int, plataforma: str) -> float:
    """``ru_maxrss`` está en bytes en macOS y en KiB en Linux."""
    return ru_maxrss / BYTES_POR_MIB if plataforma == "darwin" else ru_maxrss / KIB_POR_MIB


def pico_de_rss_mib() -> float:
    """RSS máximo alcanzado por el proceso desde que arrancó (incluye el pico de la carga de los modelos)."""
    return a_mib(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, sys.platform)


def rss_actual_mib(statm: Path = Path("/proc/self/statm")) -> float | None:
    """RSS actual en MiB (Linux); ``None`` donde no existe ``/proc`` (macOS): no se inventa una cifra."""
    try:
        paginas = int(statm.read_text(encoding="utf-8").split()[1])
    except (OSError, IndexError, ValueError):
        return None
    return paginas * os.sysconf("SC_PAGE_SIZE") / BYTES_POR_MIB


def informe_de_memoria(
    *,
    pico_durante_la_carga_mib: float,
    pico_total_mib: float,
    presupuesto_mib: float,
    rss_en_regimen_mib: float | None,
) -> dict[str, Any]:
    informe: dict[str, Any] = {
        "pico_durante_la_carga_mib": round(pico_durante_la_carga_mib, 1),
        "rss_en_regimen_mib": None if rss_en_regimen_mib is None else round(rss_en_regimen_mib, 1),
        "pico_total_mib": round(pico_total_mib, 1),
        "presupuesto_mib": presupuesto_mib,
        "dentro_de_presupuesto": pico_total_mib <= presupuesto_mib,
    }
    if pico_total_mib > presupuesto_mib:
        informe["exceso_mib"] = round(pico_total_mib - presupuesto_mib, 1)
    return informe
