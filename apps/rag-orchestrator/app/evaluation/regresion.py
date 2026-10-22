"""Umbral de regresión del reporte de `evaluate` contra ``eval/configs/regression.yaml`` (US-074, RN-22).

``regression.yaml`` declara mínimos como ``<metrica>_min: <valor>``; sin ninguno no hay umbral que aplicar. Una métrica
``null`` en el reporte (sin preguntas que la midan) incumple su mínimo: ``null`` no es 0 pero tampoco lo supera.
"""

from __future__ import annotations

import math
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


class EntradaInvalida(ValueError):
    """``regression.yaml`` o el reporte de ``evaluate`` no son utilizables; el mensaje nombra la clave, nunca su valor."""


@dataclass(frozen=True)
class Incumplimiento:
    metrica: str
    minimo: float
    actual: float | None


@dataclass(frozen=True)
class ResultadoRegresion:
    aplicado: bool
    incumplimientos: tuple[Incumplimiento, ...]


class _CargadorSinClavesRepetidas(yaml.SafeLoader):
    """``safe_load`` que rechaza una clave repetida: con la última ganando, un segundo valor bajaría el mínimo en silencio."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
        claves = [self.construct_object(clave, deep=deep) for clave, _ in node.value]
        if len(set(claves)) != len(claves):
            raise yaml.YAMLError("clave repetida")
        return super().construct_mapping(node, deep=deep)


def cargar_umbrales(ruta: Path) -> dict[str, float]:
    """Mínimos por métrica (sin el sufijo ``_min``); un archivo vacío o solo con comentarios no tiene umbrales."""
    try:
        crudo = yaml.load(ruta.read_text(encoding="utf-8"), Loader=_CargadorSinClavesRepetidas)  # noqa: S506
    except (OSError, ValueError, yaml.YAMLError) as error:
        raise EntradaInvalida("regression.yaml no se puede leer") from error
    if crudo is None:
        return {}
    if not isinstance(crudo, dict):
        raise EntradaInvalida("regression.yaml debe ser un mapa de <metrica>_min")
    return {_metrica_de(clave): _minimo_de(clave, valor) for clave, valor in crudo.items()}


def _metrica_de(clave: object) -> str:
    if isinstance(clave, str) and clave.endswith(SUFIJO_MINIMO):
        metrica = clave.removesuffix(SUFIJO_MINIMO)
        if metrica in METRICAS_CON_UMBRAL:
            return metrica
    raise EntradaInvalida(f"umbral desconocido: {clave}")


def _minimo_de(clave: object, valor: object) -> float:
    if isinstance(valor, bool) or not isinstance(valor, int | float) or not 0 <= valor <= 1:
        raise EntradaInvalida(f"{clave} debe ser un número entre 0 y 1")
    return float(valor)


def comparar_con_regresion(
    reporte: dict[str, Any], umbrales: dict[str, float]
) -> ResultadoRegresion:
    """Métricas del reporte por debajo de su mínimo, en el orden del archivo de umbrales."""
    seccion = _seccion_del_umbral(reporte)
    medidas = {metrica: _valor_en(seccion, METRICAS_CON_UMBRAL[metrica]) for metrica in umbrales}
    incumplimientos = tuple(
        Incumplimiento(metrica, minimo, medidas[metrica])
        for metrica, minimo in umbrales.items()
        if (actual := medidas[metrica]) is None or actual < minimo
    )
    return ResultadoRegresion(aplicado=bool(umbrales), incumplimientos=incumplimientos)


def _seccion_del_umbral(reporte: object) -> dict[str, Any]:
    metricas = reporte.get("metricas") if isinstance(reporte, dict) else None
    seccion = metricas.get(SECCION_DEL_UMBRAL) if isinstance(metricas, dict) else None
    if not isinstance(seccion, dict):
        raise EntradaInvalida(f"el reporte no trae metricas.{SECCION_DEL_UMBRAL}")
    return seccion


def _valor_en(seccion: dict[str, Any], ruta: tuple[str, ...]) -> float | None:
    """Valor numérico finito en la ruta; ``null``, booleanos, ``NaN`` e infinitos cuentan como sin valor."""
    nodo: Any = seccion
    for clave in ruta:
        nodo = nodo.get(clave) if isinstance(nodo, dict) else None
    es_numero = isinstance(nodo, int | float) and not isinstance(nodo, bool)
    return nodo if es_numero and math.isfinite(nodo) else None
