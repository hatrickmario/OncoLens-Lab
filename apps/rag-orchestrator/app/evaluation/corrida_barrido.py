"""`evaluate --sweep relevance_threshold` (US-073): barre la grilla, elige el umbral (D1) y escribe el informe del baseline."""

from __future__ import annotations

import asyncio
import dataclasses
import os
import re
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.application.ports import Clock
from app.domain.relevance import supera_umbral
from app.evaluation.barrido import FilaBarrido, elegir_umbral, sin_nan
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import Barrido, ConfigInvalida, ConfigSuite
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.cronometro import Cronometro
from app.evaluation.fuente_dataset import CLASE_SINTETICA, DatasetSuite
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.informe_baseline import (
    ESQUEMA_BASELINE,
    DatosDelInforme,
    agregados_del_informe,
    renderizar_informe,
)
from app.evaluation.metas import cargar_metas
from app.evaluation.metricas.familias import calcular_familias
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.metricas.sin_evidencia import exactitud_sin_evidencia
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.retrieval_metrics import ChunkRecuperado, evaluar_pregunta, metrica
from app.evaluation.rutas import raiz_repo

SALIDA_DEL_BASELINE = Path("eval") / "reports"
RUTA_DE_METAS = Path("eval") / "configs" / "metas-iniciales.yaml"
NOMBRE_DEL_INFORME = "S1-baseline"
_UMBRAL_EN_CONFIG = re.compile(r"^(\s+relevance_threshold:\s*)[0-9.]+", re.MULTILINE)


def _directorio_de_la_app() -> Path:
    return raiz_repo() / "apps" / "rag-orchestrator"


@dataclass(frozen=True)
class ValorBarrido:
    """La fila del barrido y las consultas que la produjeron (para el baseline por tipo de cáncer)."""

    fila: FilaBarrido
    resultados: list[ResultadoConsulta]


def _recall_tras_umbral(
    dataset: DatasetSuite,
    rankings: dict[str, list[ChunkRecuperado]],
    umbral: float,
    config: ConfigSuite,
) -> float | None:
    """recall@10 de los chunks que superan el umbral (``>``, como ``filtrar_sobre_umbral``): lo que el generador ve."""
    entregados = [
        evaluar_pregunta(
            p, [c for c in rankings.get(p.texto, []) if supera_umbral(c.puntaje, umbral)]
        )
        for p in dataset.preguntas
    ]
    recall = metrica(
        entregados, config.semilla_bootstrap, config.bootstrap_repeticiones
    ).recall_at_10
    return sin_nan(recall)  # NaN: ninguna pregunta con evidencia esperada


def barrer(
    config: ConfigSuite,
    dataset: DatasetSuite,
    grilla: Sequence[float],
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
) -> list[ValorBarrido]:
    """Una corrida completa de la suite por valor de la grilla; solo cambia ``relevance_threshold``."""
    valores: list[ValorBarrido] = []
    for umbral in grilla:
        umbrales = dataclasses.replace(config.umbrales, relevance_threshold=umbral)
        suite = componer_servicio(
            dataclasses.replace(config, umbrales=umbrales), dataset, cronometro_de(), reloj
        )
        resultados, _ = asyncio.run(evaluar_dataset(suite, dataset))
        fila = FilaBarrido(
            umbral,
            exactitud_sin_evidencia(resultados)["exactitud"],
            _recall_tras_umbral(dataset, suite.observaciones.rankings, umbral, config),
        )
        valores.append(ValorBarrido(fila, resultados))
    return valores


def exigir_dataset_sintetico(clase: str) -> None:
    """El informe se escribe en una ruta versionada (``eval/reports/``): el barrido solo corre con datos sintéticos (RN-14)."""
    if clase != CLASE_SINTETICA:
        raise SuiteAbortada("el barrido solo corre con un dataset sintético")


def metricas_planas(familias: dict[str, Any]) -> dict[str, float | None]:
    """Las seis métricas de las metas iniciales a partir de las familias de la suite; NaN y ausentes → ``None``."""
    recuperacion = familias.get("recuperacion", {})
    crudas = {
        "recall_at_10": recuperacion.get("total", {}).get("recall_at_10"),
        "recall_at_10_es_a_en": recuperacion.get("es_a_en", {}).get("recall_at_10"),
        "mrr": recuperacion.get("total", {}).get("mrr"),
        "fidelidad_proxy": familias.get("opciones_con_cita_y_soporte", {}).get("porcentaje"),
        "precision_citas": familias.get("citas", {}).get("precision"),
        "sin_evidencia": familias.get("sin_evidencia", {}).get("exactitud"),
    }
    return {k: sin_nan(v) for k, v in crudas.items()}


def directorio_de_configuraciones() -> Path:
    return _directorio_de_la_app() / "eval" / "configs"


def _dentro_de(ruta: Path, directorio: Path) -> bool:
    return not ruta.is_symlink() and ruta.resolve().is_relative_to(directorio.resolve())


def exigir_fijado_permitido(ruta: Path, proveedor: str, directorio: Path | None) -> None:
    """``--fijar`` solo escribe dentro del directorio de configuraciones y nunca con adapters falsos sobre la versionada:
    el umbral que sale de una calibración con falsos no significa nada y no debe quedar en una configuración versionada."""
    permitido = directorio or directorio_de_configuraciones()
    if not _dentro_de(ruta, permitido):
        raise ConfigInvalida("--fijar solo escribe dentro del directorio de configuraciones")
    if proveedor == "fake" and _dentro_de(ruta, directorio_de_configuraciones()):
        raise ConfigInvalida(
            "--fijar no se admite con adapters falsos sobre la configuración versionada"
        )


def fijar_umbral_en_config(ruta: Path, umbral: float, directorio: Path | None = None) -> None:
    """Reescribe solo el valor de ``umbrales.relevance_threshold`` (comentarios y resto del YAML intactos), de forma
    atómica (temporal + ``replace``) y solo dentro del directorio de configuraciones."""
    if not _dentro_de(ruta, directorio or directorio_de_configuraciones()):
        raise ConfigInvalida("--fijar solo escribe dentro del directorio de configuraciones")
    nuevo, cambios = _UMBRAL_EN_CONFIG.subn(rf"\g<1>{umbral:g}", ruta.read_text(encoding="utf-8"))
    if cambios != 1:
        raise ConfigInvalida("umbrales.relevance_threshold no se puede fijar en la configuración")
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=ruta.parent, suffix=".tmp", delete=False
    ) as temporal:
        temporal.write(nuevo)
    os.replace(temporal.name, ruta)


def _metricas_de(
    resultados: list[ResultadoConsulta], config: ConfigSuite
) -> dict[str, float | None]:
    familias = calcular_familias(
        resultados, "all", config.semilla_bootstrap, config.bootstrap_repeticiones
    )
    return metricas_planas(familias)


def _por_cancer(
    resultados: list[ResultadoConsulta], config: ConfigSuite
) -> dict[str, dict[str, float | None]]:
    cancers = sorted({r.recuperacion.cancer for r in resultados})
    return {
        c: _metricas_de([r for r in resultados if r.recuperacion.cancer == c], config)
        for c in cancers
    }


def _datos_del_informe(
    config: ConfigSuite,
    barrido: Barrido,
    dataset: DatasetSuite,
    valores: list[ValorBarrido],
    fijar: bool,
    p95_e2e_s: float | None,
) -> DatosDelInforme:
    filas = [v.fila for v in valores]
    eleccion = elegir_umbral(filas, barrido.umbral_de_referencia, barrido.tolerancia_recall)
    del_elegido = next(v for v in valores if v.fila.umbral == eleccion.umbral)
    return DatosDelInforme(
        clase_dataset=dataset.clase,
        proveedor=config.proveedor,
        dataset=f"{dataset.nombre}@{dataset.version}",
        hash_config=config.hash_config,
        umbral_de_referencia=barrido.umbral_de_referencia,
        tolerancia_recall=barrido.tolerancia_recall,
        filas=filas,
        eleccion=eleccion,
        fijado=fijar,
        metricas_totales=_metricas_de(del_elegido.resultados, config),
        metricas_por_cancer=_por_cancer(del_elegido.resultados, config),
        metas=cargar_metas(_directorio_de_la_app() / RUTA_DE_METAS),
        p95_e2e_s=p95_e2e_s,
    )


def ejecutar_barrido(
    config: ConfigSuite,
    ruta_config: Path,
    dataset: DatasetSuite,
    *,
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
    salida: Path | None,
    fijar: bool,
    p95_e2e_s: float | None,
    directorio_fijable: Path | None = None,
) -> int:
    if config.barrido is None:
        raise ConfigInvalida("falta la sección barrido en la configuración")
    exigir_dataset_sintetico(dataset.clase)
    if fijar:
        exigir_fijado_permitido(ruta_config, config.proveedor, directorio_fijable)
    valores = barrer(config, dataset, config.barrido.grilla, reloj, cronometro_de)
    datos = _datos_del_informe(config, config.barrido, dataset, valores, fijar, p95_e2e_s)
    carpeta = salida or _directorio_de_la_app() / SALIDA_DEL_BASELINE
    carpeta.mkdir(parents=True, exist_ok=True)
    # El JSON se valida contra la lista blanca ANTES de escribir nada: un rechazo no deja un informe a medias.
    escribir_reporte_cerrado(
        carpeta / f"{NOMBRE_DEL_INFORME}.json", agregados_del_informe(datos), ESQUEMA_BASELINE
    )
    (carpeta / f"{NOMBRE_DEL_INFORME}.md").write_text(renderizar_informe(datos), encoding="utf-8")
    if fijar:
        fijar_umbral_en_config(ruta_config, datos.eleccion.umbral, directorio_fijable)
    return 0
