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

from app.application.ports import Clock
from app.evaluation.armado_reporte import armar_reporte
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import ConfigInvalida, ConfigSuite, cargar_config_suite
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.esquema_suite import ESQUEMA_SUITE, SUITES
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio, ids_de_subconjunto
from app.evaluation.guardas import SuiteAbortada, exigir_marca_final
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.clock.system_clock import RelojDelSistema

SALIDA_POR_DEFECTO = Path("eval") / "results"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evaluate", exit_on_error=False)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--suite", default="all")
    parser.add_argument("--report", choices=("json",), default="json")
    parser.add_argument("--salida", type=Path, default=None)
    parser.add_argument("--nombre-archivo", default=None)
    parser.add_argument("--prueba-final", action="store_true")
    return parser


def _reloj_de_medicion(config: ConfigSuite) -> Callable[[], float]:
    return RelojSimulado() if config.reloj == "simulado" else time.perf_counter


def main(argv: Sequence[str], *, reloj: Clock | None = None, raiz: Path | None = None) -> int:
    try:
        args = _parser().parse_args(list(argv))
        if args.suite not in SUITES:
            raise ConfigInvalida(f"familia no disponible: {args.suite}")
        config = cargar_config_suite(args.config)
        return _ejecutar(config, args, reloj or RelojDelSistema())
    except (argparse.ArgumentError, SystemExit, ConfigInvalida) as error:
        print(f"evaluate: uso o configuración inválidos ({type(error).__name__})", file=sys.stderr)
        return 2
    except (DatasetInvalido, SuiteAbortada) as error:
        print(f"evaluate: la suite no corre: {error}", file=sys.stderr)
        return 1


def _fuente_de(config: ConfigSuite) -> FuenteDatasetEnDirectorio:
    if config.subconjunto is None or config.particion is None:
        return FuenteDatasetEnDirectorio(config.dataset)
    return FuenteDatasetEnDirectorio(
        config.dataset, ids_de_subconjunto(config.particion, config.subconjunto)
    )


def _ejecutar(config: ConfigSuite, args: argparse.Namespace, reloj: Clock) -> int:
    exigir_marca_final(config, args.prueba_final)
    dataset = _fuente_de(config).cargar()
    cronometro = Cronometro(_reloj_de_medicion(config))
    suite = componer_servicio(config, dataset, cronometro, reloj)
    resultados, respuestas = asyncio.run(evaluar_dataset(suite, dataset))
    reporte = armar_reporte(
        config, dataset, args.suite, respuestas[0].meta, resultados, cronometro.p95_ms()
    )
    destino = (args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO) / (
        args.nombre_archivo or f"{reloj.ahora().date().isoformat()}-{config.hash_config}.json"
    )
    escribir_reporte_cerrado(destino, reporte, ESQUEMA_SUITE)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
