"""Configuración de la familia `opciones` de `evaluate` (``eval/configs/opciones-fake.yaml`` y ``s5.yaml``, RN-22, US-140).

Es una configuración común de la suite (``ConfigSuite``: modelos, umbrales, catálogo y dataset) más lo propio de la familia:
``opciones.maxOptions``, el reporte de referencia del retroceso y su tolerancia (``FAITHFULNESS_REGRESSION_TOLERANCE``) y
las metas iniciales. Sin valores por defecto en código: una clave ausente es una configuración inválida (código 2).
Los mensajes nombran la clave, nunca su valor.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import ConfigInvalida, ConfigSuite, clave_de, ruta_del_repo

MAXIMO_DE_OPCIONES = 3
"""Tope de FR-09 (contrato: ``maxOptions`` de 1 a 3)."""
METRICAS_DE_REFERENCIA = {
    "fidelidad": ("metricas", "completa", "fidelidad", "nli", "fidelidad"),
    "precision_citas": ("metricas", "completa", "citas", "precision"),
}


@dataclass(frozen=True)
class Referencia:
    """Las cifras del reporte contra el que se mide el retroceso y el dataset con el que se midieron."""

    medidas: dict[str, float]
    dataset: str


@dataclass(frozen=True)
class ConfigOpciones:
    suite: ConfigSuite
    max_options: int
    reporte_de_referencia: Path
    faithfulness_regression_tolerance: float
    metas: Path


def cargar_config_opciones(ruta: Path, suite: ConfigSuite) -> ConfigOpciones:
    """``suite`` es la configuración común ya cargada de la misma ``ruta``."""
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    max_options = clave_de(crudo, "opciones", "maxOptions")
    if isinstance(max_options, bool) or not isinstance(max_options, int):
        raise ConfigInvalida("opciones.maxOptions debe ser un entero")
    if not 1 <= max_options <= MAXIMO_DE_OPCIONES:
        raise ConfigInvalida(f"opciones.maxOptions debe estar entre 1 y {MAXIMO_DE_OPCIONES}")
    return ConfigOpciones(
        suite=suite,
        max_options=max_options,
        reporte_de_referencia=ruta_del_repo(
            str(clave_de(crudo, "regresion", "reporte_referencia"))
        ),
        faithfulness_regression_tolerance=_tolerancia(
            clave_de(crudo, "regresion", "faithfulness_regression_tolerance")
        ),
        metas=ruta_del_repo(str(clave_de(crudo, "metas_iniciales"))),
    )


def _tolerancia(valor: object) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not 0 <= valor <= 1:
        raise ConfigInvalida("regresion.faithfulness_regression_tolerance debe estar en [0, 1]")
    return float(valor)


def leer_referencia(ruta: Path) -> Referencia:
    """Fidelidad y precisión de citas del reporte de referencia; sin alguna de las dos la familia no corre."""
    try:
        reporte = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ConfigInvalida("regresion.reporte_referencia no se pudo leer") from None
    medidas = {
        metrica: _valor_en(reporte, camino) for metrica, camino in METRICAS_DE_REFERENCIA.items()
    }
    if any(valor is None for valor in medidas.values()):
        raise ConfigInvalida("regresion.reporte_referencia no trae fidelidad ni precisión de citas")
    dataset = _valor_en(reporte, ("configuracion", "dataset", "nombre"), str)
    return Referencia(
        {metrica: float(valor) for metrica, valor in medidas.items() if valor is not None},
        dataset or "desconocido",
    )


def _valor_en(reporte: Any, camino: tuple[str, ...], tipo: Any = (int, float)) -> Any:
    nodo: Any = reporte
    for clave in camino:
        nodo = nodo.get(clave) if isinstance(nodo, Mapping) else None
    return nodo if isinstance(nodo, tipo) and not isinstance(nodo, bool) else None
