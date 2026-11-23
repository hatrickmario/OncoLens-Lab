"""Configuración de la familia `contextual` de `evaluate` (``eval/configs/contextual-fake.yaml`` y ``contextual-local.yaml``,
RN-22, US-271 AC-9).

Es la configuración común de la suite (``ConfigSuite``: modelos, umbrales, catálogo y dataset) más el bloque ``contextual``:
los casos sintéticos del fixture compartido, el indicador de la expansión contextual y las preguntas de sinónimos con su
término. Sin valores por defecto en código: una clave ausente es una configuración inválida (código 2). Los mensajes
nombran la clave y, cuando hace falta ubicar la pregunta, su id; nunca el texto de una pregunta (RN-14).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import (
    ConfigInvalida,
    ConfigSuite,
    clave_de,
    ruta_del_repo,
    tope_de_pares_de_los_adaptadores_falsos,
)
from app.evaluation.reporte import es_identificador


@dataclass(frozen=True)
class PreguntaDeSinonimos:
    pregunta: str
    """Id de la pregunta en ``preguntas-contextuales.yaml`` (``CTX-C12``…)."""
    termino: str
    """``terminoCanonico`` del catálogo versionado que esa pregunta nombra."""


@dataclass(frozen=True)
class ConfigContextual:
    suite: ConfigSuite
    casos: tuple[str, ...]
    """Ids de los casos del fixture; cada pregunta corre una vez por caso (design D5)."""
    casos_ruta: Path
    expansion_habilitada: bool
    """``QUERY_CONTEXT_EXPANSION_ENABLED`` de la corrida (design D6): el único interruptor del segundo loop contextual."""
    preguntas_de_sinonimos: tuple[PreguntaDeSinonimos, ...]
    reranker_max_pairs: int | None
    """``RERANKER_MAX_PAIRS`` de los adaptadores FALSOS (``None`` = sin corte). Con ``proveedor: local`` manda el del reranker cargado."""
    genericas_con_evidencia_minimo: int
    """La meta de cobertura por caso (US-273 AC-2, RN-22): genéricas con evidencia que cada caso debe alcanzar. Sin valor por defecto."""
    reporte_base: Path | None = None
    """Reporte base de la misma familia con el que se compara la corrida; ``None`` = sin comparación. Opcional por diseño."""


def cargar_config_contextual(ruta: Path, suite: ConfigSuite) -> ConfigContextual:
    """``suite`` es la configuración común ya cargada de la misma ``ruta``."""
    try:
        crudo: Any = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    casos = clave_de(crudo, "contextual", "casos")
    if not isinstance(casos, list) or not casos or not all(es_identificador(c) for c in casos):
        raise ConfigInvalida("contextual.casos debe ser una lista no vacía de ids de caso")
    if len(set(casos)) != len(casos):
        raise ConfigInvalida("contextual.casos repite un id de caso")
    casos_ruta = clave_de(crudo, "contextual", "casos_ruta")
    if not isinstance(casos_ruta, str) or not casos_ruta:
        raise ConfigInvalida("contextual.casos_ruta debe ser una ruta")
    habilitada = clave_de(crudo, "contextual", "expansion_habilitada")
    if not isinstance(habilitada, bool):
        raise ConfigInvalida("contextual.expansion_habilitada debe ser verdadero o falso")
    seccion = crudo["contextual"]
    minimo = clave_de(crudo, "contextual", "genericas_con_evidencia_minimo")
    if isinstance(minimo, bool) or not isinstance(minimo, int) or minimo < 0:
        raise ConfigInvalida(
            "contextual.genericas_con_evidencia_minimo debe ser un entero no negativo"
        )
    return ConfigContextual(
        suite,
        tuple(casos),
        ruta_del_repo(casos_ruta),
        habilitada,
        _preguntas_de_sinonimos(clave_de(crudo, "contextual", "preguntas_de_sinonimos")),
        tope_de_pares_de_los_adaptadores_falsos(seccion, suite, "contextual"),
        minimo,
        _reporte_base(seccion.get("reporte_base")),
    )


def _reporte_base(crudo: Any) -> Path | None:
    if crudo is None:
        return None
    if not isinstance(crudo, str) or not crudo:
        raise ConfigInvalida("contextual.reporte_base debe ser una ruta o estar ausente")
    return ruta_del_repo(crudo)


def _preguntas_de_sinonimos(crudo: Any) -> tuple[PreguntaDeSinonimos, ...]:
    if not isinstance(crudo, list) or not crudo:
        raise ConfigInvalida("contextual.preguntas_de_sinonimos debe ser una lista no vacía")
    declaradas = []
    for elemento in crudo:
        if not isinstance(elemento, dict) or set(elemento) != {"pregunta", "termino"}:
            raise ConfigInvalida(
                "contextual.preguntas_de_sinonimos: cada elemento declara solo pregunta y termino"
            )
        if not es_identificador(elemento["pregunta"]) or not es_identificador(elemento["termino"]):
            raise ConfigInvalida(
                "contextual.preguntas_de_sinonimos: pregunta y termino deben ser identificadores"
            )
        declaradas.append(PreguntaDeSinonimos(elemento["pregunta"], elemento["termino"]))
    if len({d.pregunta for d in declaradas}) != len(declaradas):
        raise ConfigInvalida("contextual.preguntas_de_sinonimos repite una pregunta")
    return tuple(declaradas)
