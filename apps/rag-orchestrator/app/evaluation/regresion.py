"""Umbral de regresión del reporte de `evaluate` contra ``eval/configs/regression.yaml`` (US-074, RN-22).

``regression.yaml`` declara mínimos como ``<metrica>_min: <valor>``; sin ninguno no hay umbral que aplicar. Una métrica
``null`` en el reporte (sin preguntas que la midan) incumple su mínimo: ``null`` no es 0 pero tampoco lo supera.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

AVISO_SIN_BASELINE = "Sin baseline de regresión: umbral no aplicado"
SUFIJO_MINIMO = "_min"
SECCION_DEL_UMBRAL = "completa"

# Nombre de la métrica en ``regression.yaml`` → ruta dentro de ``metricas.<sección>`` del reporte (esquema_suite).
METRICAS_CON_UMBRAL: dict[str, tuple[str, ...]] = {
    "recall_at_10": ("recuperacion", "total", "recall_at_10"),
    "mrr": ("recuperacion", "total", "mrr"),
    "precision_citas": ("citas", "precision"),
    "exactitud_sin_evidencia": ("sin_evidencia", "exactitud"),
    "opciones_con_cita_y_soporte": ("opciones_con_cita_y_soporte", "porcentaje"),
}


class UmbralesInvalidos(ValueError):
    """``regression.yaml`` no es utilizable; el mensaje nombra la clave, nunca su valor."""


@dataclass(frozen=True)
class Incumplimiento:
    metrica: str
    minimo: float
    actual: float | None


@dataclass(frozen=True)
class ResultadoRegresion:
    aplicado: bool
    incumplimientos: tuple[Incumplimiento, ...]


def cargar_umbrales(ruta: Path) -> dict[str, float]:
    """Mínimos por métrica (sin el sufijo ``_min``); un archivo vacío o solo con comentarios no tiene umbrales."""
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise UmbralesInvalidos("regression.yaml no se puede leer") from error
    if crudo is None:
        return {}
    if not isinstance(crudo, dict):
        raise UmbralesInvalidos("regression.yaml debe ser un mapa de <metrica>_min")
    return {_metrica_de(clave): _minimo_de(clave, valor) for clave, valor in crudo.items()}


def _metrica_de(clave: object) -> str:
    metrica = clave.removesuffix(SUFIJO_MINIMO) if isinstance(clave, str) else None
    if metrica not in METRICAS_CON_UMBRAL or not str(clave).endswith(SUFIJO_MINIMO):
        raise UmbralesInvalidos(f"umbral desconocido: {clave}")
    return metrica


def _minimo_de(clave: object, valor: object) -> float:
    if isinstance(valor, bool) or not isinstance(valor, int | float) or not 0 <= valor <= 1:
        raise UmbralesInvalidos(f"{clave} debe ser un número entre 0 y 1")
    return float(valor)


def comparar_con_regresion(
    reporte: dict[str, Any], umbrales: dict[str, float]
) -> ResultadoRegresion:
    """Métricas del reporte por debajo de su mínimo, en el orden del archivo de umbrales."""
    seccion = reporte["metricas"][SECCION_DEL_UMBRAL]
    incumplimientos = tuple(
        Incumplimiento(metrica, minimo, actual)
        for metrica, minimo in umbrales.items()
        if (actual := _valor_en(seccion, METRICAS_CON_UMBRAL[metrica])) is None or actual < minimo
    )
    return ResultadoRegresion(aplicado=bool(umbrales), incumplimientos=incumplimientos)


def _valor_en(seccion: dict[str, Any], ruta: tuple[str, ...]) -> float | None:
    nodo: Any = seccion
    for clave in ruta:
        nodo = nodo.get(clave) if isinstance(nodo, dict) else None
    return nodo if isinstance(nodo, int | float) else None
