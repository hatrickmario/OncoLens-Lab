"""Runner `evaluate` (US-072, ADR-41): ``python -m app.evaluation.evaluate --config <ruta> --suite <familia>``.

Códigos de salida: 0 correcto; 1 la suite se negó a correr (dataset, proveedores, prueba congelada); 2 uso o
configuración inválidos. Los mensajes nombran la causa y nunca llevan textos de preguntas ni de salidas (RN-14).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from contextlib import AsyncExitStack
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.errores import ErrorDeAplicacion
from app.application.ports import Clock
from app.evaluation.armado_reporte import armar_reporte
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import (
    ENTORNO_DEL_JUEZ,
    SUITE_COMPLETA,
    SUITES,
    ConfigInvalida,
    ConfigSuite,
    cargar_config_suite,
)
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.esquema_suite import ESQUEMA_SUITE
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.fuente_dataset import (
    DatasetSuite,
    FuenteDatasetEnDirectorio,
    ids_de_subconjunto,
)
from app.evaluation.guardas import (
    SuiteAbortada,
    exigir_adapters_locales,
    exigir_juez_local,
    exigir_marca_final,
)
from app.evaluation.informe_pii import (
    InformePiiB1,
    InformePiiInvalido,
    ProveedorPii,
    ProveedorPiiDeArchivo,
    SinInformePii,
)
from app.evaluation.juez_fidelidad import JuezNoDisponible, crear_juez_llm
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.metricas.privacidad import privacidad
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.lenguaje.terminos_prohibidos import ListaDeTerminosNoDisponible
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.schemas.generated.models import RagQueryInternalResponse

SALIDA_POR_DEFECTO = Path("eval") / "results"
SUITE_PII = "pii"
SUITES_CON_PRIVACIDAD = (SUITE_PII, SUITE_COMPLETA)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evaluate", exit_on_error=False)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--suite", default=SUITE_COMPLETA)
    parser.add_argument("--report", choices=("json",), default="json")
    parser.add_argument("--salida", type=Path, default=None)
    parser.add_argument("--nombre-archivo", default=None)
    parser.add_argument("--prueba-final", action="store_true")
    parser.add_argument("--informe-pii", type=Path, default=None)
    for (
        clave
    ) in ENTORNO_DEL_JUEZ:  # --juez-modelo, --juez-base-url, --juez-temperatura, --juez-semilla
        parser.add_argument(f"--juez-{clave.replace('_', '-')}", dest=f"juez_{clave}", default=None)
    return parser


def _reloj_de_medicion(config: ConfigSuite) -> Callable[[], float]:
    return RelojSimulado() if config.reloj == "simulado" else time.perf_counter


def main(
    argv: Sequence[str],
    *,
    reloj: Clock | None = None,
    raiz: Path | None = None,
    entorno: Mapping[str, str] | None = None,
) -> int:
    try:
        args = _parser().parse_args(list(argv))
        if args.suite not in SUITES:
            raise ConfigInvalida(f"familia no disponible: {args.suite}")
        config = cargar_config_suite(args.config, _ajustes_del_juez(args, entorno))
        return _ejecutar(config, args, reloj or RelojDelSistema(), raiz)
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
    except JuezNoDisponible:
        print("evaluate: el juez de fidelidad no está disponible", file=sys.stderr)
        return 1
    except ListaDeTerminosNoDisponible:
        print("evaluate: la lista de términos prohibidos no está disponible", file=sys.stderr)
        return 1
    except InformePiiInvalido as error:
        print(f"evaluate: el informe de PII de B1 no es válido: {error}", file=sys.stderr)
        return 1
    except (DatasetInvalido, SuiteAbortada) as error:
        print(f"evaluate: la suite no corre: {error}", file=sys.stderr)
        return 1


def _ajustes_del_juez(
    args: argparse.Namespace, entorno: Mapping[str, str] | None
) -> dict[str, str]:
    """``EVAL_JUDGE_*`` (ADR-41) sin leer el entorno del proceso (US-037 AC-1: solo ``app/config/`` lo hace).

    Llegan por ``entorno`` (quien invoca ``main``: el envoltorio o un test) y los flags ``--juez-*`` los sustituyen.
    """
    ajustes = dict(entorno or {})
    for clave, variable in ENTORNO_DEL_JUEZ.items():
        valor = getattr(args, f"juez_{clave}")
        if valor is not None:
            ajustes[variable] = valor
    return ajustes


def _fuente_de(config: ConfigSuite, raiz: Path | None) -> FuenteDatasetEnDirectorio:
    if config.subconjunto is None or config.particion is None:
        return FuenteDatasetEnDirectorio(config.dataset, raiz=raiz)
    return FuenteDatasetEnDirectorio(
        config.dataset, ids_de_subconjunto(config.particion, config.subconjunto), raiz
    )


def _ejecutar(
    config: ConfigSuite, args: argparse.Namespace, reloj: Clock, raiz: Path | None
) -> int:
    exigir_marca_final(config, args.prueba_final)
    exigir_juez_local(config.juez)  # RN-12: antes de cargar nada ni crear un cliente
    fuente = _fuente_de(config, raiz)
    exigir_adapters_locales(
        fuente.clase(), config.urls
    )  # RN-12: antes de cargar nada ni crear un cliente
    informe_pii = _proveedor_pii(
        config, args
    ).leer()  # antes de consultar: un informe roto no cuesta una corrida
    reporte = _correr_suite(config, fuente.cargar(), args.suite, reloj, informe_pii)
    escribir_reporte_cerrado(_ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_SUITE)
    return 0


def _proveedor_pii(config: ConfigSuite, args: argparse.Namespace) -> ProveedorPii:
    ruta = args.informe_pii or config.informe_pii
    if ruta is None:
        return SinInformePii()
    return ProveedorPiiDeArchivo(ruta if ruta.is_absolute() else raiz_repo() / ruta)


def _correr_suite(
    config: ConfigSuite,
    dataset: DatasetSuite,
    suite: str,
    reloj: Clock,
    informe_pii: InformePiiB1 | None,
) -> dict[str, Any]:
    cronometro = Cronometro(_reloj_de_medicion(config))
    registro = RegistroDeLlamadas()
    resultados: list[ResultadoConsulta] = []
    meta = None
    if suite != SUITE_PII:  # la familia pii no consulta al servicio: mide solo la privacidad
        resultados, respuestas = asyncio.run(_evaluar(config, dataset, cronometro, reloj, registro))
        meta = respuestas[0].meta
    privacidad_medida = (
        privacidad(len(dataset.textos_pii), informe_pii, registro.llamadas)
        if suite in SUITES_CON_PRIVACIDAD
        else None
    )
    return armar_reporte(
        config, dataset, suite, meta, resultados, cronometro.p95_ms(), privacidad_medida
    )


async def _evaluar(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    registro: RegistroDeLlamadas,
) -> tuple[list[ResultadoConsulta], list[RagQueryInternalResponse]]:
    async with AsyncExitStack() as pila:  # cierra el cliente del juez LLM, si lo hay
        juez_llm = await crear_juez_llm(config.juez, pila, registro, dataset.clase)
        servicio = componer_servicio(config, dataset, cronometro, reloj, juez_llm)
        return await evaluar_dataset(servicio, dataset)


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
