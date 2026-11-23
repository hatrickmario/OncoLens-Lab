"""Configuración de la familia `diagnostico` de `evaluate` (``eval/configs/diagnostico-fake.yaml`` y ``diagnostico-local.yaml``,
RN-22, US-276).

Es la configuración común de la suite (``ConfigSuite``: modelos, umbrales, catálogo y dataset) más el bloque ``diagnostico``:
los pares mínimos del dataset, el límite inferior de la banda del NLI y el ancho del tramo del histograma. Sin valores por
defecto en código: una clave ausente es una configuración inválida (código 2). Los mensajes nombran la clave, nunca su valor.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import ConfigInvalida, ConfigSuite, clave_de
from app.evaluation.metricas.diagnostico import histograma_de_p_entailment


@dataclass(frozen=True)
class ConfigDiagnostico:
    suite: ConfigSuite
    pares_minimos: int
    """Pares mínimos del dataset de paráfrasis (``diagnostico.pares_minimos``)."""
    nli_banda_inferior: float
    """Límite inferior de la banda de ``p_entailment`` que se cuenta bajo ``NLI_ENTAILMENT_THRESHOLD`` (``diagnostico.nli_banda_inferior``)."""
    nli_ancho_de_tramo: float
    """Ancho de cada tramo del histograma de ``p_entailment`` (``diagnostico.nli_ancho_de_tramo``)."""
    reranker_max_pairs: int | None
    """``RERANKER_MAX_PAIRS`` de los adaptadores FALSOS (``None`` = sin corte). Con ``proveedor: local`` manda el del reranker cargado."""


def cargar_config_diagnostico(ruta: Path, suite: ConfigSuite) -> ConfigDiagnostico:
    """``suite`` es la configuración común ya cargada de la misma ``ruta``."""
    try:
        crudo: Any = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    pares_minimos = clave_de(crudo, "diagnostico", "pares_minimos")
    if isinstance(pares_minimos, bool) or not isinstance(pares_minimos, int) or pares_minimos < 1:
        raise ConfigInvalida("diagnostico.pares_minimos debe ser un entero positivo")
    banda = _fraccion(clave_de(crudo, "diagnostico", "nli_banda_inferior"), "nli_banda_inferior")
    if banda >= suite.umbrales.nli_entailment_threshold:
        raise ConfigInvalida(
            "diagnostico.nli_banda_inferior debe ser menor que umbrales.nli_entailment_threshold"
        )
    ancho = _fraccion(clave_de(crudo, "diagnostico", "nli_ancho_de_tramo"), "nli_ancho_de_tramo")
    try:
        histograma_de_p_entailment([], ancho)
    except ValueError:
        raise ConfigInvalida(
            "diagnostico.nli_ancho_de_tramo debe dividir el intervalo [0, 1] en tramos iguales"
        ) from None
    return ConfigDiagnostico(
        suite, pares_minimos, banda, ancho, _tope_de_pares(crudo["diagnostico"], suite)
    )


def _fraccion(valor: object, clave: str) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)) or not 0.0 <= valor <= 1.0:
        raise ConfigInvalida(f"diagnostico.{clave} debe ser un número en [0, 1]")
    return float(valor)


def _tope_de_pares(seccion: dict[str, Any], suite: ConfigSuite) -> int | None:
    tope = seccion.get("reranker_max_pairs")
    if tope is None:
        return None
    if suite.proveedor != "fake":
        raise ConfigInvalida("diagnostico.reranker_max_pairs solo aplica con adaptadores falsos")
    if isinstance(tope, bool) or not isinstance(tope, int) or tope < 1:
        raise ConfigInvalida("diagnostico.reranker_max_pairs debe ser un entero positivo")
    return tope
