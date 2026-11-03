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
from app.domain.relevance import corte_para_el_generador
from app.evaluation.barrido import FilaBarrido, elegir_umbral, sin_nan
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import Barrido, ConfigInvalida, ConfigSuite, minimos_del_juez
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.cronometro import Cronometro
from app.evaluation.desagregacion import agregar_por_tipo_e_idioma, mediana_de_p95
from app.evaluation.fuente_dataset import CLASE_SINTETICA, DatasetSuite
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.informe_baseline import (
    ESQUEMA_BASELINE,
    ETIQUETAS_CANCER,
    DatosDelInforme,
    agregados_del_informe,
    renderizar_informe,
)
from app.evaluation.metas import cargar_metas
from app.evaluation.modelos_locales import PuertosLocales
from app.evaluation.metricas.familias import calcular_familias
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.metricas.sin_evidencia import exactitud_sin_evidencia
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.retrieval_metrics import ChunkRecuperado, evaluar_pregunta, metrica
from app.evaluation.rutas import raiz_repo

SALIDA_DEL_BASELINE = Path("eval") / "reports"
RUTA_DE_METAS = Path("eval") / "configs" / "metas-iniciales.yaml"
NOMBRE_DEL_INFORME = "S1-baseline"
_UMBRAL_EN_CONFIG = re.compile(r"^(\s+relevance_threshold:\s*)[-+0-9.eE]+", re.MULTILINE)


def directorio_de_la_app() -> Path:
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
    """recall@10 de lo que ve el generador: los ``RERANK_TOP_N`` primeros del reranker que superan el umbral."""
    entregados = [
        evaluar_pregunta(
            p,
            corte_para_el_generador(
                rankings.get(p.texto, []),
                config.umbrales.rerank_top_n,
                umbral,
                lambda chunk: chunk.puntaje,
            ),
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
    puertos_locales: PuertosLocales | None = None,
) -> list[ValorBarrido]:
    """Una corrida completa de la suite por valor de la grilla; solo cambia ``relevance_threshold``."""
    valores: list[ValorBarrido] = []
    for umbral in grilla:
        umbrales = dataclasses.replace(config.umbrales, relevance_threshold=umbral)
        suite = componer_servicio(
            dataclasses.replace(config, umbrales=umbrales),
            dataset,
            cronometro_de(),
            reloj,
            puertos_locales=puertos_locales,
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
    return directorio_de_la_app() / "eval" / "configs"


def _dentro_de(ruta: Path, directorio: Path) -> bool:
    return not ruta.is_symlink() and ruta.resolve().is_relative_to(directorio.resolve())


def exigir_fijado_permitido(ruta: Path, proveedor: str, directorio_de_configs: Path | None) -> None:
    """``--fijar`` solo escribe dentro del directorio de configuraciones y nunca con adapters falsos sobre la versionada:
    el umbral que sale de una calibración con falsos no significa nada y no debe quedar en una configuración versionada."""
    permitido = directorio_de_configs or directorio_de_configuraciones()
    if not _dentro_de(ruta, permitido):
        raise ConfigInvalida("--fijar solo escribe dentro del directorio de configuraciones")
    if proveedor == "fake" and _dentro_de(ruta, directorio_de_configuraciones()):
        raise ConfigInvalida(
            "--fijar no se admite con adapters falsos sobre la configuración versionada"
        )


def config_con_umbral(texto: str, umbral: float) -> str:
    """El texto de la configuración con ``umbrales.relevance_threshold`` reemplazado (comentarios y resto intactos).

    Solo reescribe el estilo de bloque con una única aparición; cualquier otro (flow, ausente, repetido) lanza
    ``ConfigInvalida`` sin tocar nada, para decidirlo ANTES de escribir ningún informe."""
    nuevo, cambios = _UMBRAL_EN_CONFIG.subn(rf"\g<1>{umbral:g}", texto)
    if cambios != 1:
        raise ConfigInvalida("umbrales.relevance_threshold no se puede fijar en la configuración")
    return nuevo


def _escribir_atomico(ruta: Path, texto: str) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=ruta.parent, suffix=".tmp", delete=False
    ) as temporal:
        temporal.write(texto)
    os.replace(temporal.name, ruta)


def fijar_umbral_en_config(
    ruta: Path, umbral: float, directorio_de_configs: Path | None = None
) -> None:
    """Reescribe solo el valor de ``umbrales.relevance_threshold`` (comentarios y resto del YAML intactos), de forma
    atómica (temporal + ``replace``) y solo dentro del directorio de configuraciones."""
    if not _dentro_de(ruta, directorio_de_configs or directorio_de_configuraciones()):
        raise ConfigInvalida("--fijar solo escribe dentro del directorio de configuraciones")
    _escribir_atomico(ruta, config_con_umbral(ruta.read_text(encoding="utf-8"), umbral))


def metricas_de(
    resultados: list[ResultadoConsulta], config: ConfigSuite
) -> dict[str, float | None]:
    familias = calcular_familias(
        resultados,
        "all",
        config.semilla_bootstrap,
        config.bootstrap_repeticiones,
        *minimos_del_juez(config),
    )
    return metricas_planas(familias)


def _por_cancer(
    resultados: list[ResultadoConsulta], config: ConfigSuite
) -> dict[str, dict[str, float | None]]:
    cancers = sorted({r.recuperacion.cancer for r in resultados})
    return {
        c: metricas_de([r for r in resultados if r.recuperacion.cancer == c], config)
        for c in cancers
    }


def p95_en_proceso(
    config: ConfigSuite,
    dataset: DatasetSuite,
    umbral: float,
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
    corridas: int,
    puertos_locales: PuertosLocales | None,
) -> float | None:
    """Mediana (s) de los p95 de la etapa ``consulta`` de ``EVAL_P95_RUNS`` corridas completas con el umbral elegido."""
    umbrales = dataclasses.replace(config.umbrales, relevance_threshold=umbral)
    p95_por_corrida: list[float | None] = []
    for _ in range(corridas):
        cronometro = cronometro_de()
        suite = componer_servicio(
            dataclasses.replace(config, umbrales=umbrales),
            dataset,
            cronometro,
            reloj,
            puertos_locales=puertos_locales,
        )
        asyncio.run(evaluar_dataset(suite, dataset))
        p95_ms = cronometro.p95_ms()["consulta"]
        p95_por_corrida.append(None if p95_ms is None else p95_ms / 1000.0)
    return mediana_de_p95(p95_por_corrida)


def _datos_del_informe(
    config: ConfigSuite,
    barrido: Barrido,
    dataset: DatasetSuite,
    valores: list[ValorBarrido],
    fijar: bool,
    p95_del_umbral: Callable[[float], float | None],
    p95_origen: str,
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
        metricas_totales=metricas_de(del_elegido.resultados, config),
        metricas_por_cancer=_por_cancer(del_elegido.resultados, config),
        metas=cargar_metas(directorio_de_la_app() / RUTA_DE_METAS),
        p95_e2e_s=p95_del_umbral(eleccion.umbral),
        metricas_por_tipo_e_idioma=agregar_por_tipo_e_idioma(
            del_elegido.resultados,
            tuple(ETIQUETAS_CANCER),
            lambda consultas: metricas_de(list(consultas), config),
        ),
        p95_corridas=config.p95_corridas,
        p95_origen=p95_origen,
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
    directorio_de_configs: Path | None = None,
    puertos_locales: PuertosLocales | None = None,
) -> int:
    if config.barrido is None:
        raise ConfigInvalida("falta la sección barrido en la configuración")
    exigir_dataset_sintetico(dataset.clase)
    if fijar:
        exigir_fijado_permitido(ruta_config, config.proveedor, directorio_de_configs)
    valores = barrer(config, dataset, config.barrido.grilla, reloj, cronometro_de, puertos_locales)

    def p95_del_umbral(umbral: float) -> float | None:
        """El p95 pasado (``--p95-e2e-s``, de punta a punta) manda; sin él, la mediana de las corridas en proceso."""
        if p95_e2e_s is not None or config.p95_corridas is None:
            return p95_e2e_s
        return p95_en_proceso(
            config, dataset, umbral, reloj, cronometro_de, config.p95_corridas, puertos_locales
        )

    p95_origen = (
        "medicion_externa"
        if p95_e2e_s is not None
        else "corridas_en_proceso"
        if config.p95_corridas is not None
        else "no_declarado"
    )
    datos = _datos_del_informe(
        config, config.barrido, dataset, valores, fijar, p95_del_umbral, p95_origen
    )
    texto_fijado = (
        config_con_umbral(ruta_config.read_text(encoding="utf-8"), datos.eleccion.umbral)
        if fijar
        else None
    )  # lanza ConfigInvalida antes de escribir nada: «fijado» en el informe es el resultado, no la intención
    carpeta = salida or directorio_de_la_app() / SALIDA_DEL_BASELINE
    carpeta.mkdir(parents=True, exist_ok=True)
    # El JSON se valida contra la lista blanca ANTES de escribir nada: un rechazo no deja un informe a medias.
    escribir_reporte_cerrado(
        carpeta / f"{NOMBRE_DEL_INFORME}.json", agregados_del_informe(datos), ESQUEMA_BASELINE
    )
    (carpeta / f"{NOMBRE_DEL_INFORME}.md").write_text(renderizar_informe(datos), encoding="utf-8")
    if texto_fijado is not None:
        _escribir_atomico(ruta_config, texto_fijado)
    return 0
