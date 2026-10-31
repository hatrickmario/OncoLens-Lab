"""Corrida multi-brazo (US-133): las mismas preguntas, los mismos modelos y el mismo índice por cada brazo de recuperación.

Los adaptadores (modelos y vectores de los chunks) se cargan UNA vez y cada brazo solo cambia sus ``RETRIEVAL_*``, de modo
que la diferencia entre brazos se atribuye únicamente al modo de recuperación. Sin juez LLM: la comparación mide la
recuperación.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.application.errores import RecuperacionNoDisponibleError
from app.application.ports import Clock
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.composicion_suite import (
    Adaptadores,
    ServicioDeSuite,
    adaptadores_de_suite,
    componer_servicio,
)
from app.evaluation.config_suite import Comparacion, ConfigSuite
from app.evaluation.corrida import (
    evaluar_pregunta_en_servicio,
    resultado_sin_recuperacion,
    solicitud_base,
)
from app.evaluation.cronometro import Cronometro
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.modelos_locales import PuertosLocales
from app.schemas.generated.models import RagMeta


@dataclass(frozen=True)
class ResultadoDeBrazo:
    brazo: Brazo
    servicio: ServicioDeSuite
    resultados: list[ResultadoConsulta]
    metas: list[RagMeta]
    """El ``meta`` de cada consulta que respondió, en orden; las que fallaron cerradas no tienen."""
    sin_terminos_lexicos: int
    """Preguntas cuya rama *sparse* no tuvo términos y fallaron cerradas (US-248 AC-4); cuentan como fallo de recall."""


async def evaluar_brazos(
    config: ConfigSuite,
    comparacion: Comparacion,
    dataset: DatasetSuite,
    reloj: Clock,
    nuevo_cronometro: Callable[[], Cronometro],
    puertos_locales: PuertosLocales | None,
) -> list[ResultadoDeBrazo]:
    """Cada brazo, en el orden de la configuración, sobre los mismos adaptadores ya cargados."""
    adaptadores = adaptadores_de_suite(config, dataset, puertos_locales)
    return [
        await _evaluar_brazo(config, brazo, dataset, reloj, nuevo_cronometro(), adaptadores)
        for brazo in comparacion.brazos
    ]


async def _evaluar_brazo(
    config: ConfigSuite,
    brazo: Brazo,
    dataset: DatasetSuite,
    reloj: Clock,
    cronometro: Cronometro,
    adaptadores: Adaptadores,
) -> ResultadoDeBrazo:
    servicio = componer_servicio(
        config, dataset, cronometro, reloj, brazo=brazo, adaptadores=adaptadores
    )
    base = solicitud_base()
    resultados: list[ResultadoConsulta] = []
    metas: list[RagMeta] = []
    sin_terminos = 0
    for indice, pregunta in enumerate(dataset.preguntas):
        try:
            resultado, respuesta = await evaluar_pregunta_en_servicio(
                servicio, dataset, base, pregunta, indice
            )
        except RecuperacionNoDisponibleError:
            if pregunta.texto not in servicio.observaciones.sin_terminos_lexicos:
                raise  # un fallo de verdad de la recuperación no se disfraza de «sin términos»
            resultados.append(resultado_sin_recuperacion(pregunta, dataset))
            sin_terminos += 1
            continue
        resultados.append(resultado)
        metas.append(respuesta.meta)
    return ResultadoDeBrazo(brazo, servicio, resultados, metas, sin_terminos)
