"""`evaluate --sweep nli_entailment_threshold|retrieval_top_k` (US-120 AC-5, ARR-03 AC-5): barre la grilla sobre el corpus, elige el
valor con las reglas puras de ``barrido.py`` y escribe el informe ``S5-barrido-<parámetro>``.

No fija nada en la configuración: los valores definitivos se escriben tras la corrida con modelos locales (tarea 7.1). Solo
corre con un dataset sintético (RN-14) y solo escribe cifras agregadas (sin textos de preguntas ni de salidas).
"""

from __future__ import annotations

import asyncio
import dataclasses
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.application.ports import Clock
from app.evaluation.barrido import (
    EleccionDeCalibracion,
    FilaDeCalibracion,
    MetasDeEntailment,
    elegir_top_k,
    elegir_umbral_entailment,
)
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import Barrido, ConfigInvalida, ConfigSuite, Umbrales
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.corrida_barrido import (
    RUTA_DE_METAS,
    directorio_de_la_app,
    exigir_dataset_sintetico,
    metricas_de,
)
from app.evaluation.cronometro import Cronometro
from app.evaluation.fuente_dataset import CLASES_ADMITIDAS, DatasetSuite
from app.evaluation.metas import cargar_metas
from app.evaluation.modelos_locales import PuertosLocales
from app.evaluation.reporte import (
    Booleano,
    Enumerado,
    Huella,
    Identificador,
    Lista,
    Numero,
    Objeto,
    escribir_reporte_cerrado,
)

PARAMETRO_ENTAILMENT = "nli_entailment_threshold"
PARAMETRO_TOP_K = "retrieval_top_k"
PARAMETROS_DE_CALIBRACION = (PARAMETRO_ENTAILMENT, PARAMETRO_TOP_K)
ESQUEMA_CALIBRACION = "oncolens.calibracion.v1"
SALIDA_DE_LA_CALIBRACION = Path("eval") / "reports"
_COLUMNAS = ("fidelidad", "precision_citas", "sin_evidencia", "recall_at_10", "mrr")
_ENCABEZADOS = (
    "fidelidad (proxy)",
    "precisión de citas",
    "«sin evidencia»",
    "recall@10",
    "MRR",
)
_CLAVE_METRICA = {"fidelidad": "fidelidad_proxy"}


@dataclass(frozen=True)
class Calibracion:
    parametro: str
    grilla: tuple[float, ...]
    provisional: float
    filas: Sequence[FilaDeCalibracion]
    eleccion: EleccionDeCalibracion
    tolerancia_recall: float | None


def _umbrales_con(umbrales: Umbrales, parametro: str, valor: float) -> Umbrales:
    if parametro == PARAMETRO_ENTAILMENT:
        return dataclasses.replace(umbrales, nli_entailment_threshold=valor)
    return dataclasses.replace(umbrales, retrieval_top_k=int(valor))


def _grilla_de(barrido: Barrido, parametro: str) -> tuple[float, ...]:
    grilla: tuple[float, ...] = (
        barrido.nli_entailment_threshold_grid
        if parametro == PARAMETRO_ENTAILMENT
        else tuple(float(k) for k in barrido.retrieval_top_k_grid)
    )
    if not grilla:
        raise ConfigInvalida(f"falta la grilla de {parametro} en barrido")
    return grilla


async def barrer_calibracion(
    config: ConfigSuite,
    dataset: DatasetSuite,
    parametro: str,
    grilla: Sequence[float],
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
    puertos_locales: PuertosLocales | None = None,
) -> list[FilaDeCalibracion]:
    """Una corrida completa de la suite por valor de la grilla; solo cambia el parámetro barrido."""
    filas: list[FilaDeCalibracion] = []
    for valor in grilla:
        cronometro = cronometro_de()
        umbrales = _umbrales_con(config.umbrales, parametro, valor)
        suite = componer_servicio(
            dataclasses.replace(config, umbrales=umbrales),
            dataset,
            cronometro,
            reloj,
            puertos_locales=puertos_locales,
        )
        resultados, _ = await evaluar_dataset(suite, dataset)
        metricas = metricas_de(resultados, config)
        filas.append(
            FilaDeCalibracion(
                valor,
                p95_busqueda_ms=cronometro.p95_ms()["busqueda"],
                **{c: metricas[_CLAVE_METRICA.get(c, c)] for c in _COLUMNAS},
            )
        )
    return filas


def _metas_de_entailment(config_metas: dict[str, Any]) -> MetasDeEntailment:
    precision, sin_evidencia = config_metas["precision_citas"], config_metas["sin_evidencia"]
    if precision.minimo is None or sin_evidencia.minimo is None:
        raise ConfigInvalida(
            "las metas de precisión de citas y «sin evidencia» deben declarar minimo"
        )
    return MetasDeEntailment(precision.minimo, sin_evidencia.minimo)


async def calibrar(
    config: ConfigSuite,
    dataset: DatasetSuite,
    parametro: str,
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
    puertos_locales: PuertosLocales | None = None,
) -> Calibracion:
    barrido = config.barrido
    if barrido is None:
        raise ConfigInvalida("falta la sección barrido en la configuración")
    grilla = _grilla_de(barrido, parametro)
    filas = await barrer_calibracion(
        config, dataset, parametro, grilla, reloj, cronometro_de, puertos_locales
    )
    if parametro == PARAMETRO_ENTAILMENT:
        provisional = config.umbrales.nli_entailment_threshold
        metas = cargar_metas(directorio_de_la_app() / RUTA_DE_METAS)
        eleccion = elegir_umbral_entailment(filas, _metas_de_entailment(metas), provisional)
        return Calibracion(parametro, grilla, provisional, filas, eleccion, None)
    provisional = float(config.umbrales.retrieval_top_k)
    tolerancia = barrido.retrieval_top_k_recall_tolerance or 0.0
    eleccion = elegir_top_k(filas, tolerancia, provisional, barrido.retrieval_p95_maximo_ms)
    return Calibracion(parametro, grilla, provisional, filas, eleccion, tolerancia)


def _numero(valor: float | None) -> str:
    return "n/a" if valor is None else f"{valor:.3f}"


def _valor(parametro: str, valor: float) -> str:
    return f"{valor:.2f}" if parametro == PARAMETRO_ENTAILMENT else f"{valor:g}"


def renderizar_calibracion(c: Calibracion, config: ConfigSuite, dataset: DatasetSuite) -> str:
    aviso = (
        [
            "> Calibración con adapters falsos (FX-T5a-a): demuestra el mecanismo y no se aplica. El valor definitivo sale de la "
            "corrida con los modelos locales de ADR-39 (tarea 8.3, D5-08).",
            "",
        ]
        if config.proveedor == "fake"
        else []
    )
    tabla = [
        f"| {c.parametro} | {' | '.join(_ENCABEZADOS)} |",
        "|---|---|---|---|---|---|",
        *(
            f"| {_valor(c.parametro, f.valor)} | "
            + " | ".join(_numero(getattr(f, columna)) for columna in _COLUMNAS)
            + " |"
            for f in c.filas
        ),
    ]
    estado = "sin valor elegible" if c.eleccion.sin_valor_elegible else "elegido"
    return (
        "\n".join(
            [
                f"# Calibración de `{c.parametro}` (US-120 AC-5)",
                "",
                *aviso,
                f"Dataset {dataset.nombre}@{dataset.version} (clase {dataset.clase}) · proveedor `{config.proveedor}` · "
                f"hashConfig `{config.hash_config}` · valor provisional {_valor(c.parametro, c.provisional)}.",
                "",
                *tabla,
                "",
                f"Elegido: {_valor(c.parametro, c.eleccion.valor)} ({estado}; sin fijar: los valores definitivos se escriben "
                "en `Settings` y Compose tras la corrida con modelos locales, tarea 7.1)",
                "",
                f"Justificación: {c.eleccion.justificacion}",
            ]
        )
        + "\n"
    )


_FILA = Objeto(
    {
        "valor": Numero(),
        "fidelidad": Numero(),
        "precisionCitas": Numero(),
        "sinEvidencia": Numero(),
        "recallAt10": Numero(),
        "mrr": Numero(),
        "p95BusquedaMs": Numero(),
    }
)
ESQUEMA_DE_CALIBRACION = Objeto(
    {
        "esquema": Enumerado(frozenset({ESQUEMA_CALIBRACION})),
        "parametro": Enumerado(frozenset(PARAMETROS_DE_CALIBRACION)),
        "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
        "proveedor": Enumerado(frozenset({"fake", "local"})),
        "dataset": Identificador(),
        "hashConfig": Huella(),
        "provisional": Numero(),
        "toleranciaRecall": Numero(),
        "filas": Lista(_FILA),
        "elegido": Numero(),
        "sinValorElegible": Booleano(),
    }
)


def agregados_de_la_calibracion(
    c: Calibracion, config: ConfigSuite, dataset: DatasetSuite
) -> dict[str, Any]:
    return {
        "esquema": ESQUEMA_CALIBRACION,
        "parametro": c.parametro,
        "claseDataset": dataset.clase,
        "proveedor": config.proveedor,
        "dataset": f"{dataset.nombre}@{dataset.version}",
        "hashConfig": config.hash_config,
        "provisional": c.provisional,
        "toleranciaRecall": c.tolerancia_recall,
        "filas": [
            {
                "valor": f.valor,
                "fidelidad": f.fidelidad,
                "precisionCitas": f.precision_citas,
                "sinEvidencia": f.sin_evidencia,
                "recallAt10": f.recall_at_10,
                "mrr": f.mrr,
                "p95BusquedaMs": f.p95_busqueda_ms,
            }
            for f in c.filas
        ],
        "elegido": c.eleccion.valor,
        "sinValorElegible": c.eleccion.sin_valor_elegible,
    }


def ejecutar_calibracion(
    config: ConfigSuite,
    parametro: str,
    dataset: DatasetSuite,
    *,
    reloj: Clock,
    cronometro_de: Callable[[], Cronometro],
    salida: Path | None,
    fijar: bool,
    puertos_locales: PuertosLocales | None = None,
) -> int:
    """Escribe ``S5-barrido-<parámetro>.{json,md}``; la configuración nunca se modifica."""
    if fijar:
        raise ConfigInvalida(
            "--fijar no aplica a este barrido: los valores definitivos son de la tarea 7.1"
        )
    exigir_dataset_sintetico(dataset.clase)
    calibracion = asyncio.run(
        calibrar(config, dataset, parametro, reloj, cronometro_de, puertos_locales)
    )
    carpeta = salida or directorio_de_la_app() / SALIDA_DE_LA_CALIBRACION
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"S5-barrido-{parametro}"
    # El JSON se valida contra la lista blanca ANTES de escribir nada: un rechazo no deja un informe a medias.
    escribir_reporte_cerrado(
        carpeta / f"{nombre}.json",
        agregados_de_la_calibracion(calibracion, config, dataset),
        ESQUEMA_DE_CALIBRACION,
    )
    (carpeta / f"{nombre}.md").write_text(
        renderizar_calibracion(calibracion, config, dataset), encoding="utf-8"
    )
    return 0
