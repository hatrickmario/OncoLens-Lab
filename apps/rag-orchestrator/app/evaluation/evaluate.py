"""Runner `evaluate` (US-072, ADR-41): ``python -m app.evaluation.evaluate --config <ruta> --suite <familia>``.

Códigos de salida: 0 correcto; 1 la suite se negó a correr (dataset, proveedores, prueba congelada, golden de la
partición distinto); 2 uso o configuración inválidos; 3 la comparación de brazos terminó con un retroceso (US-133). Los mensajes nombran la causa y nunca llevan textos de preguntas ni de salidas (RN-14).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from contextlib import AsyncExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.errores import ErrorDeAplicacion
from app.application.ports import Clock
from app.config.entorno import entorno_del_proceso
from app.evaluation.armado_comparacion import armar_comparacion
from app.evaluation.armado_reporte import armar_reporte
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import (
    ENTORNO_DEL_JUEZ,
    SUITE_COMPLETA,
    SUITES,
    Comparacion,
    ConfigInvalida,
    ConfigSuite,
    cargar_config_suite,
)
from app.evaluation.corrida import evaluar_dataset
from app.evaluation.corrida_aplicabilidad import (
    SUITE_APLICABILIDAD,
    PuertosDeAplicabilidad,
    ejecutar_aplicabilidad,
)
from app.evaluation.corrida_poblacion import (
    SUITE_POBLACION,
    MedicionSinEvidencia,
    PuertosDePoblacion,
    ejecutar_poblacion,
)
from app.evaluation.corrida_barrido import ejecutar_barrido, exigir_dataset_sintetico
from app.evaluation.corrida_brazos import ResultadoDeBrazo, evaluar_brazos
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.envoltorios import pico_rss_mib
from app.evaluation.esquema_suite import ESQUEMA_SUITE
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
    exigir_proveedor_local,
    verificar_golden_sha256,
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
from app.evaluation.medicion_modelos import informe_de_recursos_nli
from app.evaluation.medidores import LatenciasNli
from app.evaluation.metricas.privacidad import privacidad
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.modelos_locales import (
    CargadorDeModelos,
    LectorDeRss,
    OrigenLocal,
    cargar_puertos_locales,
)
from app.evaluation.reporte import ReporteFueraDeEsquema, escribir_reporte_cerrado
from app.evaluation.rutas import raiz_repo
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.lenguaje.terminos_prohibidos import ListaDeTerminosNoDisponible
from app.schemas.generated.models import RagMeta, RagQueryInternalResponse

SALIDA_POR_DEFECTO = Path("eval") / "results"
SUITE_PII = "pii"
SUITES_CON_PRIVACIDAD = (SUITE_PII, SUITE_COMPLETA)
CODIGO_RETROCESO = 3


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
    parser.add_argument("--sweep", choices=("relevance_threshold",), default=None)
    parser.add_argument("--fijar", action="store_true")
    parser.add_argument("--p95-e2e-s", type=float, default=None)
    parser.add_argument("--corpus-cutoff-date", default=None)
    return parser


def _reloj_de_medicion(config: ConfigSuite) -> Callable[[], float]:
    return RelojSimulado() if config.reloj == "simulado" else time.perf_counter


def main(
    argv: Sequence[str],
    *,
    reloj: Clock | None = None,
    raiz: Path | None = None,
    entorno: Mapping[str, str] | None = None,
    directorio_de_configs: Path | None = None,
    puertos_aplicabilidad: PuertosDeAplicabilidad | None = None,
    puertos_poblacion: PuertosDePoblacion | None = None,
    cargador_de_modelos: CargadorDeModelos | None = None,
    lector_rss: LectorDeRss | None = None,
) -> int:
    try:
        return _despachar_familia(
            _parser().parse_args(list(argv)),
            reloj or RelojDelSistema(),
            raiz,
            OrigenLocal(entorno or {}, cargador_de_modelos, lector_rss or pico_rss_mib),
            directorio_de_configs,
            puertos_aplicabilidad or PuertosDeAplicabilidad(),
            puertos_poblacion or PuertosDePoblacion(),
        )
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
    except ReporteFueraDeEsquema:
        print("evaluate: el reporte no cumple el esquema cerrado; no se escribió", file=sys.stderr)
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


def _despachar_familia(
    args: argparse.Namespace,
    reloj: Clock,
    raiz: Path | None,
    origen: OrigenLocal,
    directorio_de_configs: Path | None,
    puertos_aplicabilidad: PuertosDeAplicabilidad,
    puertos_poblacion: PuertosDePoblacion,
) -> int:
    """Las familias `aplicabilidad` (US-132) y `poblacion` (L1D-299) tienen configuración, dataset y reporte propios; el
    resto, la configuración común."""
    if args.suite not in SUITES:
        raise ConfigInvalida(f"familia no disponible: {args.suite}")
    if args.suite == SUITE_APLICABILIDAD:
        return ejecutar_aplicabilidad(args, reloj, puertos_aplicabilidad)
    if args.suite == SUITE_POBLACION:
        medidor = puertos_poblacion.medidor_sin_evidencia or _medidor_de_sin_evidencia(
            reloj, raiz, origen
        )
        return ejecutar_poblacion(args, reloj, PuertosDePoblacion(medidor))
    config = cargar_config_suite(args.config, _ajustes_de_la_suite(args, origen.entorno))
    return _ejecutar(config, args, reloj, raiz, origen, directorio_de_configs)


def _medidor_de_sin_evidencia(
    reloj: Clock, raiz: Path | None, origen: OrigenLocal
) -> Callable[[Path], MedicionSinEvidencia]:
    """«Sin evidencia» (RN-02) tal como lo mide la suite `all` de la configuración dada, para la regresión de `poblacion`."""

    def medir(ruta_de_config: Path) -> MedicionSinEvidencia:
        config = cargar_config_suite(ruta_de_config, {})
        reporte, _ = _correr_suite(
            config, _fuente_de(config, raiz).cargar(), SUITE_COMPLETA, reloj, None, origen
        )
        medida = reporte["metricas"]["completa"]["sin_evidencia"]
        return MedicionSinEvidencia(medida["exactitud"], medida["violaciones_rn02"])

    return medir


def _ajustes_de_la_suite(
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
    config: ConfigSuite,
    args: argparse.Namespace,
    reloj: Clock,
    raiz: Path | None,
    origen: OrigenLocal,
    directorio_de_configs: Path | None = None,
) -> int:
    exigir_marca_final(config, args.prueba_final)
    exigir_juez_local(config.juez)  # RN-12: antes de cargar nada ni crear un cliente
    fuente = _fuente_de(config, raiz)
    exigir_adapters_locales(
        fuente.clase(), config.urls
    )  # RN-12: antes de cargar nada ni crear un cliente
    exigir_proveedor_local(config)  # RN-12: los adapters locales y su modelo, antes de cargar pesos
    if config.comparacion is not None and config.particion is not None:
        verificar_golden_sha256(config.particion)  # ADR-45 P2: antes de abrir ninguna pregunta
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
    informe_pii = _proveedor_pii(
        config, args
    ).leer()  # antes de consultar: un informe roto no cuesta una corrida
    reporte, hay_retroceso = _correr_suite(
        config, fuente.cargar(), args.suite, reloj, informe_pii, origen
    )
    escribir_reporte_cerrado(_ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_SUITE)
    return CODIGO_RETROCESO if hay_retroceso else 0


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
    origen: OrigenLocal,
) -> tuple[dict[str, Any], bool]:
    """El reporte de la suite y si la comparación de brazos terminó con un retroceso (US-133)."""
    registro = RegistroDeLlamadas()
    medido = _Medicion([], None, Cronometro(_reloj_de_medicion(config)), None, None)
    if suite != SUITE_PII:  # la familia pii no consulta al servicio: mide solo la privacidad
        medido = (
            _medir_comparacion(config, dataset, reloj, registro, origen)
            if config.comparacion is not None
            else _medir_un_brazo(config, dataset, reloj, registro, origen)
        )
    privacidad_medida = (
        privacidad(len(dataset.textos_pii), informe_pii, registro.llamadas)
        if suite in SUITES_CON_PRIVACIDAD
        else None
    )
    reporte = armar_reporte(
        config,
        dataset,
        suite,
        medido.meta,
        medido.resultados,
        medido.cronometro.p95_ms(),
        privacidad_medida,
        medido.recursos_nli,
        medido.comparacion,
    )
    return reporte, medido.retroceso


@dataclass(frozen=True)
class _Medicion:
    """Lo que la corrida entrega al reporte: los resultados del brazo de referencia y, si hay, la comparación."""

    resultados: list[ResultadoConsulta]
    meta: RagMeta | None
    cronometro: Cronometro
    recursos_nli: dict[str, object] | None
    comparacion: dict[str, Any] | None
    retroceso: bool = False
    """Algún brazo híbrido retrocedió frente a A0 (US-133): lo calcula la comparación, no se relee del reporte."""


def _medir_un_brazo(
    config: ConfigSuite,
    dataset: DatasetSuite,
    reloj: Clock,
    registro: RegistroDeLlamadas,
    origen: OrigenLocal,
) -> _Medicion:
    cronometro = Cronometro(_reloj_de_medicion(config))
    resultados, respuestas, latencias = asyncio.run(
        _evaluar(config, dataset, cronometro, reloj, registro, origen)
    )
    return _Medicion(
        resultados,
        respuestas[0].meta,
        cronometro,
        _recursos_del_nli(config, latencias, origen),
        None,
    )


def _medir_comparacion(
    config: ConfigSuite,
    dataset: DatasetSuite,
    reloj: Clock,
    registro: RegistroDeLlamadas,
    origen: OrigenLocal,
) -> _Medicion:
    """Todos los brazos; el reporte principal es el de la referencia (A0) y la comparación va aparte."""
    comparacion = config.comparacion
    if comparacion is None:
        raise ConfigInvalida("falta el bloque comparacion")
    brazos = asyncio.run(_evaluar_brazos(config, comparacion, dataset, reloj, registro, origen))
    referencia = brazos[0]
    armada = armar_comparacion(config, comparacion, brazos)
    return _Medicion(
        referencia.resultados,
        referencia.metas[0],
        referencia.servicio.cronometro,
        _recursos_del_nli(config, referencia.servicio.latencias_nli, origen),
        armada.seccion,
        armada.retroceso,
    )


def _recursos_del_nli(
    config: ConfigSuite, latencias: LatenciasNli, origen: OrigenLocal
) -> dict[str, object] | None:
    """Pico de RSS del proceso y latencia del NLI (US-233a AC-7): solo con los modelos reales; con fakes no hay nada que medir."""
    if config.proveedor != "local" or config.rss_limite_mib is None:
        return None
    return informe_de_recursos_nli(
        latencias.por_lote_ms,
        latencias.media_por_hipotesis_del_lote_ms,
        origen.lector_rss(),
        config.rss_limite_mib,
    )


async def _evaluar(
    config: ConfigSuite,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    reloj: Clock,
    registro: RegistroDeLlamadas,
    origen: OrigenLocal,
) -> tuple[list[ResultadoConsulta], list[RagQueryInternalResponse], LatenciasNli]:
    puertos_locales = (
        cargar_puertos_locales(config, origen, registro, dataset.clase)
        if config.proveedor == "local"
        else None
    )
    async with AsyncExitStack() as pila:  # cierra el cliente del juez LLM, si lo hay
        juez_llm = await crear_juez_llm(config.juez, pila, registro, dataset.clase)
        servicio = componer_servicio(config, dataset, cronometro, reloj, juez_llm, puertos_locales)
        resultados, respuestas = await evaluar_dataset(servicio, dataset)
        return resultados, respuestas, servicio.latencias_nli


async def _evaluar_brazos(
    config: ConfigSuite,
    comparacion: Comparacion,
    dataset: DatasetSuite,
    reloj: Clock,
    registro: RegistroDeLlamadas,
    origen: OrigenLocal,
) -> list[ResultadoDeBrazo]:
    """Todos los brazos de ``comparacion`` sobre los mismos modelos locales cargados una sola vez."""
    puertos_locales = (
        cargar_puertos_locales(config, origen, registro, dataset.clase)
        if config.proveedor == "local"
        else None
    )
    return await evaluar_brazos(
        config,
        comparacion,
        dataset,
        reloj,
        lambda: Cronometro(_reloj_de_medicion(config)),
        puertos_locales,
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
    sys.exit(main(sys.argv[1:], entorno=entorno_del_proceso()))
