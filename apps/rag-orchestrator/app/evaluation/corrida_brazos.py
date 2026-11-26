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
from app.domain.corpus_seed.coleccion_de_la_variante import (
    ColeccionNoCorrespondeALaVariante,
    exigir_coleccion_de_la_variante,
)
from app.domain.ventanas_del_reranker import ConfiguracionDelReranker
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
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.indice_con_contexto import construir_indice_con_contexto
from app.evaluation.indice_del_corpus import IndiceDelCorpus
from app.evaluation.medidores import Observaciones
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.modelos_locales import PuertosLocales
from app.evaluation.reescritura_del_brazo import reescritura_efectiva_coincide
from app.schemas.generated.models import RagMeta, RagQueryInternalResponse


@dataclass(frozen=True)
class IndiceEnMemoriaDelBrazo:
    """El índice que la suite construyó para un brazo de contexto sobre el corpus del dataset (la CI): lo que costó y lo que cubrió."""

    construccion_s: float
    chunks: int
    respaldo_por_salida_invalida: int
    respaldo_por_llm_no_disponible: int


@dataclass(frozen=True)
class ResultadoDeBrazo:
    brazo: Brazo
    servicio: ServicioDeSuite
    resultados: list[ResultadoConsulta]
    metas: list[RagMeta]
    """El ``meta`` de cada consulta que respondió, en orden; las que fallaron cerradas no tienen."""
    sin_terminos_lexicos: int
    """Preguntas cuya rama *sparse* no tuvo términos y fallaron cerradas (US-248 AC-4); cuentan como fallo de recall."""
    reranker: ConfiguracionDelReranker | None = None
    """La etapa del reranker tal como corrió la última consulta del brazo (US-278); ``None`` si el adapter no la expone."""
    indice: IndiceDelCorpus | None = None
    """El índice de solo lectura que leyó el brazo (``indice.fuente: milvus``); ``None`` = el corpus del dataset en memoria."""
    indice_en_memoria: IndiceEnMemoriaDelBrazo | None = None
    """Solo un brazo de contexto con el corpus en memoria (US-279 AC-5): su índice construido por la suite; ``None`` en el resto."""


def exigir_brazo_sin_poblacion(brazo: Brazo, respuesta: RagQueryInternalResponse) -> None:
    """Un brazo con colección propia no consume población (ADR-47): ``identificador_de_chunk`` da el mismo id a chunks distintos
    en la colección de 512 y en la de 1024, y la población se cita por ``chunk_id``; mide solo la recuperación (deuda D7-19)."""
    if (
        brazo.coleccion is not None
        and not brazo.declara_contexto  # una colección de contexto conserva los chunk_id de la de origen (US-279 D4)
        and any(fuente.criteria for fuente in respuesta.applicability)
    ):
        raise SuiteAbortada(
            f"el brazo {brazo.nombre} lee su propia colección y no puede consumir población (ADR-47): "
            "sus chunk_id colisionan con los de la colección de la suite"
        )


def exigir_reescritura_del_brazo(
    brazo: Brazo, observaciones: Observaciones, reescrituras_previas: int, sin_evidencia: bool
) -> None:
    """La reescritura efectiva de la consulta (las invocaciones al puerto del reescritor) es la que el brazo declara; si no,
    la corrida no mide lo que dice medir y aborta (US-277 AC-5). Un brazo sin reescritor medido no se comprueba."""
    esperada = observaciones.reescritura_esperada
    if esperada is None:
        return
    invocaciones = observaciones.reescrituras - reescrituras_previas
    if not reescritura_efectiva_coincide(esperada, invocaciones, sin_evidencia):
        raise SuiteAbortada(
            f"el brazo {brazo.nombre} corrió una consulta con una reescritura distinta de la que declara "
            "(QUERY_REWRITE_ENABLED)"
        )


def exigir_coleccion_del_brazo(brazo: Brazo, indice: IndiceDelCorpus | None) -> None:
    """La colección que lee un brazo de contexto es la de SU variante (US-279 D5, RN-22): si no, la corrida mediría un índice ajeno."""
    if brazo.contexto is None or indice is None:
        return
    try:
        exigir_coleccion_de_la_variante(indice.resumen.coleccion, brazo.contexto)
    except ColeccionNoCorrespondeALaVariante as error:
        raise SuiteAbortada(f"el brazo {brazo.nombre}: {error}") from None


def _con_el_indice_del_brazo(
    config: ConfigSuite,
    brazo: Brazo,
    adaptadores: Adaptadores,
    dataset: DatasetSuite,
    cronometro: Cronometro,
    indice: IndiceDelCorpus | None,
) -> tuple[Adaptadores, IndiceEnMemoriaDelBrazo | None]:
    """Un brazo de contexto sobre el corpus en memoria construye su índice (cronometrado); con ``indice.fuente: milvus`` lee su
    colección y no se vuelve a embeber nada. Un brazo sin variante usa los adaptadores de la suite tal cual."""
    if brazo.contexto is None or indice is not None or config.indice_fuente != "en_memoria":
        return adaptadores, None
    construido, segundos = cronometro.cronometrar(
        construir_indice_con_contexto, adaptadores, dataset, brazo.contexto
    )
    return construido.adaptadores, IndiceEnMemoriaDelBrazo(
        segundos,
        construido.chunks,
        construido.respaldo_por_salida_invalida,
        construido.respaldo_por_llm_no_disponible,
    )


async def evaluar_brazos(
    config: ConfigSuite,
    comparacion: Comparacion,
    dataset: DatasetSuite,
    reloj: Clock,
    nuevo_cronometro: Callable[[], Cronometro],
    puertos_locales: PuertosLocales | None,
    abrir_indice: Callable[[str | None], IndiceDelCorpus] | None = None,
    adaptadores: Adaptadores | None = None,
) -> list[ResultadoDeBrazo]:
    """Cada brazo, en el orden de la configuración, sobre los mismos adaptadores ya cargados.

    Con ``abrir_indice`` (``indice.fuente: milvus``) cada brazo lee la ingesta en solo lectura: la colección de la
    configuración o la suya propia (``Brazo.coleccion``, el de chunks de 512 tokens); cada colección se abre una sola vez.
    ``adaptadores`` ya cargados (los de la suite o los de una prueba) evitan construir otros."""
    indices: dict[str | None, IndiceDelCorpus] = {}
    if abrir_indice is not None:
        for brazo in comparacion.brazos:
            if brazo.coleccion not in indices:
                indices[brazo.coleccion] = abrir_indice(brazo.coleccion)
            exigir_coleccion_del_brazo(brazo, indices[brazo.coleccion])
    adaptadores = adaptadores or adaptadores_de_suite(
        config,
        dataset,
        puertos_locales,
        next(iter(indices.values())).puertos if indices else None,
    )
    return [
        await _evaluar_brazo(
            config,
            brazo,
            dataset,
            reloj,
            nuevo_cronometro(),
            adaptadores,
            indices.get(brazo.coleccion),
        )
        for brazo in comparacion.brazos
    ]


async def _evaluar_brazo(
    config: ConfigSuite,
    brazo: Brazo,
    dataset: DatasetSuite,
    reloj: Clock,
    cronometro: Cronometro,
    adaptadores: Adaptadores,
    indice: IndiceDelCorpus | None = None,
) -> ResultadoDeBrazo:
    adaptadores, en_memoria = _con_el_indice_del_brazo(
        config, brazo, adaptadores, dataset, cronometro, indice
    )
    servicio = componer_servicio(
        config,
        dataset,
        cronometro,
        reloj,
        brazo=brazo,
        adaptadores=adaptadores,
        corpus=None if indice is None else indice.puertos,
    )
    base = solicitud_base()
    resultados: list[ResultadoConsulta] = []
    metas: list[RagMeta] = []
    sin_terminos = 0
    for posicion, pregunta in enumerate(dataset.preguntas):
        reescrituras_previas = servicio.observaciones.reescrituras
        try:
            resultado, respuesta = await evaluar_pregunta_en_servicio(
                servicio, dataset, base, pregunta, posicion
            )
        except RecuperacionNoDisponibleError:
            if pregunta.texto not in servicio.observaciones.sin_terminos_lexicos:
                raise  # un fallo de verdad de la recuperación no se disfraza de «sin términos»
            resultados.append(resultado_sin_recuperacion(pregunta, dataset))
            sin_terminos += 1
            continue
        exigir_brazo_sin_poblacion(brazo, respuesta)
        exigir_reescritura_del_brazo(
            brazo, servicio.observaciones, reescrituras_previas, resultado.sin_evidencia
        )
        resultados.append(resultado)
        metas.append(respuesta.meta)
    if servicio.observaciones.reranker_discrepante:
        raise SuiteAbortada(
            f"el brazo {brazo.nombre} corrió consultas con un reranker distinto del que declara (RERANKER_*)"
        )
    return ResultadoDeBrazo(
        brazo,
        servicio,
        resultados,
        metas,
        sin_terminos,
        servicio.observaciones.reranker,
        indice,
        en_memoria,
    )
