"""Runner `evaluate` (US-072, ADR-41): ``python -m app.evaluation.evaluate --config <ruta> --suite <familia>``.

Códigos de salida: 0 correcto; 1 la suite se negó a correr (dataset, proveedores, prueba congelada); 2 uso o
configuración inválidos. Los mensajes nombran la causa y nunca llevan textos de preguntas ni de salidas (RN-14).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.errores import ErrorDeAplicacion
from app.application.ports import Clock
from app.evaluation.armado_reporte import armar_reporte
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import (
    SUITE_COMPLETA,
    SUITES,
    ConfigInvalida,
    ConfigSuite,
    cargar_config_suite,
)
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.corrida_barrido import ejecutar_barrido, exigir_dataset_sintetico
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.esquema_suite import ESQUEMA_SUITE
from app.evaluation.fuente_dataset import (
    DatasetSuite,
    FuenteDatasetEnDirectorio,
    ids_de_subconjunto,
)
from app.evaluation.guardas import SuiteAbortada, exigir_adapters_locales, exigir_marca_final
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.clock.system_clock import RelojDelSistema

SALIDA_POR_DEFECTO = Path("eval") / "results"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evaluate", exit_on_error=False)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--suite", default=SUITE_COMPLETA)
    parser.add_argument("--report", choices=("json",), default="json")
    parser.add_argument("--salida", type=Path, default=None)
    parser.add_argument("--nombre-archivo", default=None)
    parser.add_argument("--prueba-final", action="store_true")
    parser.add_argument("--sweep", choices=("relevance_threshold",), default=None)
    parser.add_argument("--fijar", action="store_true")
    parser.add_argument("--p95-e2e-s", type=float, default=None)
    return parser


def _reloj_de_medicion(config: ConfigSuite) -> Callable[[], float]:
    return RelojSimulado() if config.reloj == "simulado" else time.perf_counter


def main(
    argv: Sequence[str],
    *,
    reloj: Clock | None = None,
    raiz: Path | None = None,
    directorio_de_configs: Path | None = None,
) -> int:
    try:
        args = _parser().parse_args(list(argv))
        if args.suite not in SUITES:
            raise ConfigInvalida(f"familia no disponible: {args.suite}")
        config = cargar_config_suite(args.config)
        return _ejecutar(config, args, reloj or RelojDelSistema(), raiz, directorio_de_configs)
    except (argparse.ArgumentError, SystemExit, ConfigInvalida) as error:
        print(f"evaluate: uso o configuración inválidos ({type(error).__name__})", file=sys.stderr)
        return 2
    except ValidationError as error:  # solo ubicación y tipo: nunca ``input_value`` (RN-14)
        detalle = "; ".join(f"{'.'.join(map(str, e['loc']))}:{e['type']}" for e in error.errors())
        print(f"evaluate: solicitud inválida ({detalle})", file=sys.stderr)
        return 2
    except ErrorDeAplicacion as error:
        print(f"evaluate: el servicio falló ({type(error).__name__})", file=sys.stderr)
        return 1
    except (DatasetInvalido, SuiteAbortada) as error:
        print(f"evaluate: la suite no corre: {error}", file=sys.stderr)
        return 1


def _fuente_de(config: ConfigSuite, raiz: Path | None) -> FuenteDatasetEnDirectorio:
    if config.subconjunto is None or config.particion is None:
        return FuenteDatasetEnDirectorio(config.dataset, raiz=raiz)
    return FuenteDatasetEnDirectorio(
        config.dataset, ids_de_subconjunto(config.particion, config.subconjunto), raiz
    )


def _ejecutar(
    config: ConfigSuite,
    args: argparse.Namespace,
    reloj: Clock,
    raiz: Path | None,
    directorio_de_configs: Path | None = None,
) -> int:
    exigir_marca_final(config, args.prueba_final)
    fuente = _fuente_de(config, raiz)
    exigir_adapters_locales(
        fuente.clase(), config.urls
    )  # RN-12: antes de cargar nada ni crear un cliente
    if args.sweep:
        exigir_dataset_sintetico(fuente.clase())  # RN-14: antes de cargar nada
        return ejecutar_barrido(
            config,
            args.config,
            fuente.cargar(),
            reloj=reloj,
            cronometro_de=lambda: Cronometro(_reloj_de_medicion(config)),
            salida=args.salida,
            fijar=args.fijar,
            p95_e2e_s=args.p95_e2e_s,
            directorio_de_configs=directorio_de_configs,
        )
    reporte = _correr_suite(config, fuente.cargar(), args.suite, reloj)
    escribir_reporte_cerrado(_ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_SUITE)
    return 0


def _correr_suite(
    config: ConfigSuite, dataset: DatasetSuite, suite: str, reloj: Clock
) -> dict[str, Any]:
    cronometro = Cronometro(_reloj_de_medicion(config))
    servicio = componer_servicio(config, dataset, cronometro, reloj)
    resultados, respuestas = asyncio.run(evaluar_dataset(servicio, dataset))
    return armar_reporte(
        config, dataset, suite, respuestas[0].meta, resultados, cronometro.p95_ms()
    )


def _ruta_del_resultado(config: ConfigSuite, args: argparse.Namespace, reloj: Clock) -> Path:
    """``<salida>/<fecha>-<hashConfig>[-<suite>].json``: la fecha viene del reloj inyectado, la huella de la
    configuración; una familia parcial lleva su nombre para no pisar el resultado de la suite completa."""
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    sufijo = "" if args.suite == SUITE_COMPLETA else f"-{args.suite}"
    return carpeta / (
        args.nombre_archivo
        or f"{reloj.ahora().date().isoformat()}-{config.hash_config}{sufijo}.json"
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
