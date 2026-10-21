"""`evaluate --sweep relevance_threshold` (US-073): barre la grilla, elige el umbral (D1) y escribe el informe del baseline."""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.application.ports import Clock
from app.evaluation.barrido import ValorBarrido, barrer, elegir_umbral, sin_nan
from app.evaluation.config_suite import Barrido, ConfigInvalida, ConfigSuite
from app.evaluation.cronometro import Cronometro
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.informe_baseline import (
    DatosDelInforme,
    agregados_del_informe,
    renderizar_informe,
)
from app.evaluation.metas import cargar_metas
from app.evaluation.metricas.familias import calcular_familias
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.reporte import escribir_reporte
from app.evaluation.rutas import raiz_repo

SALIDA_DEL_BASELINE = Path("eval") / "reports"
RUTA_DE_METAS = Path("eval") / "configs" / "metas-iniciales.yaml"
NOMBRE_DEL_INFORME = "S1-baseline"
_UMBRAL_EN_CONFIG = re.compile(r"^(\s+relevance_threshold:\s*)[0-9.]+", re.MULTILINE)


def _directorio_de_la_app() -> Path:
    return raiz_repo() / "apps" / "rag-orchestrator"


def metricas_planas(familias: dict[str, Any]) -> dict[str, float | None]:
    """Las seis métricas de las metas iniciales a partir de las familias de la suite; NaN y ausentes → ``None``."""
    recuperacion = familias.get("recuperacion", {})
    crudas = {
        "recall_at_10": recuperacion.get("total", {}).get("recall_at_10"),
        "recall_at_10_es_a_en": recuperacion.get("es_a_en", {}).get("recall_at_10"),
        "mrr": recuperacion.get("total", {}).get("mrr"),
        "fidelidad": familias.get("opciones_con_cita_y_soporte", {}).get("porcentaje"),
        "precision_citas": familias.get("citas", {}).get("precision"),
        "sin_evidencia": familias.get("sin_evidencia", {}).get("exactitud"),
    }
    return {k: sin_nan(v) for k, v in crudas.items()}


def fijar_umbral_en_config(ruta: Path, umbral: float) -> None:
    """Reescribe solo el valor de ``umbrales.relevance_threshold``; los comentarios y el resto del YAML quedan como están."""
    texto = ruta.read_text(encoding="utf-8")
    nuevo, cambios = _UMBRAL_EN_CONFIG.subn(rf"\g<1>{umbral:g}", texto)
    if cambios != 1:
        raise ConfigInvalida("umbrales.relevance_threshold no se puede fijar en la configuración")
    ruta.write_text(nuevo, encoding="utf-8")


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
) -> int:
    if config.barrido is None:
        raise ConfigInvalida("falta la sección barrido en la configuración")
    valores = barrer(config, dataset, config.barrido.grilla, reloj, cronometro_de)
    datos = _datos_del_informe(config, config.barrido, dataset, valores, fijar, p95_e2e_s)
    carpeta = salida or _directorio_de_la_app() / SALIDA_DEL_BASELINE
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / f"{NOMBRE_DEL_INFORME}.md").write_text(renderizar_informe(datos), encoding="utf-8")
    escribir_reporte(carpeta / f"{NOMBRE_DEL_INFORME}.json", agregados_del_informe(datos))
    if fijar:
        fijar_umbral_en_config(ruta_config, datos.eleccion.umbral)
    return 0
