"""Configuración de la familia `poblacion` de `evaluate` (``eval/configs/test-poblacion.yaml``, RN-22, L1D-299).

Las metas, los mínimos de pares y los parámetros de la extracción viven aquí y nunca en el código."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import (
    PROVEEDORES,
    RELOJES,
    ConfigInvalida,
    _en,
    clave_de,
    huella_de_config,
    ruta_del_repo,
)
from app.evaluation.reporte import es_identificador


@dataclass(frozen=True)
class ParametrosDeExtraccion:
    """Los valores a calibrar de la extracción en abanico (``POPULATION_*``, RN-22)."""

    top_k: int
    max_valores_por_criterio: int
    max_tokens_de_salida: int
    concurrencia: int
    reintentos: int


@dataclass(frozen=True)
class MetasDePoblacion:
    precision_minima: float
    cobertura_minima: float
    concordancia_minima: float
    duplicados_maximos: float


@dataclass(frozen=True)
class ConfigPoblacion:
    nombre: str
    fixture: str
    dataset: Path
    reloj: str
    proveedor: str
    umbral_nli: float
    catalogo: Path
    extraccion: ParametrosDeExtraccion
    licencias_aceptadas: frozenset[str]
    metas: MetasDePoblacion
    minimo_de_pares_del_dorado: int
    minimo_de_pares_del_bucle: int
    config_sin_evidencia: Path
    baseline: Path
    hash_config: str


def cargar_config_poblacion(ruta: Path) -> ConfigPoblacion:
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    if not isinstance(crudo, dict):
        raise ConfigInvalida("la configuración no es un mapa YAML")
    fixture = str(clave_de(crudo, "fixture"))
    if not es_identificador(fixture):
        raise ConfigInvalida("fixture no es un identificador válido")
    return ConfigPoblacion(
        nombre=str(clave_de(crudo, "nombre")),
        fixture=fixture,
        dataset=ruta_del_repo(str(clave_de(crudo, "dataset", "ruta"))),
        reloj=_en(str(clave_de(crudo, "medicion", "reloj")), RELOJES, "medicion.reloj"),
        proveedor=_en(
            str(clave_de(crudo, "adaptadores", "proveedor")), PROVEEDORES, "adaptadores.proveedor"
        ),
        umbral_nli=_numero(clave_de(crudo, "umbrales", "nli_entailment_threshold"), "umbrales"),
        catalogo=ruta_del_repo(str(clave_de(crudo, "catalogo", "ruta"))),
        extraccion=_extraccion(clave_de(crudo, "extraccion")),
        licencias_aceptadas=_licencias(clave_de(crudo, "licencias_aceptadas")),
        metas=_metas(clave_de(crudo, "metas")),
        minimo_de_pares_del_dorado=_entero(
            clave_de(crudo, "dorado", "minimo_de_pares"), "dorado.minimo_de_pares"
        ),
        minimo_de_pares_del_bucle=_entero(
            clave_de(crudo, "bucle", "minimo_de_pares"), "bucle.minimo_de_pares"
        ),
        config_sin_evidencia=ruta_del_repo(str(clave_de(crudo, "sin_evidencia", "config"))),
        baseline=ruta_del_repo(str(clave_de(crudo, "sin_evidencia", "baseline"))),
        hash_config=huella_de_config(crudo),
    )


def _extraccion(crudo: dict[str, Any]) -> ParametrosDeExtraccion:
    return ParametrosDeExtraccion(
        top_k=_entero(clave_de(crudo, "top_k"), "extraccion.top_k"),
        max_valores_por_criterio=_entero(
            clave_de(crudo, "max_valores_por_criterio"), "extraccion.max_valores_por_criterio"
        ),
        max_tokens_de_salida=_entero(
            clave_de(crudo, "max_tokens_de_salida"), "extraccion.max_tokens_de_salida"
        ),
        concurrencia=_entero(clave_de(crudo, "concurrencia"), "extraccion.concurrencia"),
        reintentos=_entero(clave_de(crudo, "reintentos"), "extraccion.reintentos", minimo=0),
    )


def _metas(crudo: dict[str, Any]) -> MetasDePoblacion:
    return MetasDePoblacion(
        precision_minima=_fraccion(clave_de(crudo, "precision", "minimo"), "metas.precision"),
        cobertura_minima=_fraccion(clave_de(crudo, "cobertura", "minimo"), "metas.cobertura"),
        concordancia_minima=_fraccion(
            clave_de(crudo, "concordancia", "minimo"), "metas.concordancia"
        ),
        duplicados_maximos=_fraccion(
            clave_de(crudo, "tasa_duplicados", "maximo"), "metas.tasa_duplicados"
        ),
    )


def _licencias(crudo: Any) -> frozenset[str]:
    if not isinstance(crudo, list) or not crudo or not all(isinstance(x, str) for x in crudo):
        raise ConfigInvalida("licencias_aceptadas debe ser una lista de nombres")
    return frozenset(crudo)


def _numero(valor: Any, clave: str) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ConfigInvalida(f"la clave {clave} debe ser un número")
    return float(valor)


def _fraccion(valor: Any, clave: str) -> float:
    numero = _numero(valor, clave)
    if not 0.0 <= numero <= 1.0:
        raise ConfigInvalida(f"la clave {clave} debe estar en [0, 1]")
    return numero


def _entero(valor: Any, clave: str, minimo: int = 1) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int) or valor < minimo:
        raise ConfigInvalida(f"la clave {clave} debe ser un entero >= {minimo}")
    return valor
