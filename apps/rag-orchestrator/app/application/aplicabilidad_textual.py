"""``AplicabilidadTextual``: respaldo textual de la población del estudio (US-244, US-123, ADR-47, FR-25, RN-01).

Para los criterios que ``population_criteria`` marca ``pendiente``, la tarea corta de US-242 (una fuente y un criterio por
llamada) solo **propone** el valor del estudio con una cita; el valor se acepta
únicamente si la cita es un chunk recuperado de esa fuente en esta consulta, el lenguaje es permitido (RN-23) y el NLI da
``entailment`` sobre el umbral con ese chunk como premisa. El estado lo asigna la regla del catálogo (la misma de
``ApplicabilityService``), nunca el LLM, y el valor del paciente se copia del contexto (ADR-34).

Un respaldo que falla (salida cortada o inválida, plazo vencido, LLM caído) deja SOLO ese criterio ``desconocido`` con
``respaldo_fallido`` y el análisis sigue (RN-26); un fallo del NLI sigue siendo ``NliNoDisponibleError``: nunca se devuelve
aplicabilidad sin validar. Logs: conteos, latencia, ``nliModel``, la versión del prompt y ``traceId``; del respaldo fallido,
además, criterio, causa, ``finish_reason``, longitud y los ``chunkId`` del corpus público; jamás el valor propuesto, el texto
de un chunk, el prompt ni la salida del LLM (RN-10, RN-14, RN-25).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime

from app.application.aplicabilidad import AplicabilidadDeFuente
from app.application.chunk_citable import ChunkCitable
from app.application.ports import Clock, FalloDelLlm, PoblacionTask, ProhibitedTermsChecker
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_text import (
    CausaDeRespaldo,
    ChunkDeFuente,
    FuenteParaProponer,
    MotivoDeRechazo,
    PlanDePropuestas,
    PropuestaDePoblacion,
    RespaldoFallido,
    ResultadoDePropuestas,
    aceptar_propuestas,
    con_valor_textual,
    criterios_pendientes,
    degradar_a_respaldo_fallido,
    pares_para_el_nli,
    planificar_propuestas,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.relevance import ordenar_por_relevancia

logger = logging.getLogger(__name__)

SIN_FINISH_REASON = "none"


@dataclass(frozen=True)
class ParametrosDelRespaldo:
    """Valores de configuración del respaldo (RN-22): plazo por llamada, llamadas simultáneas y versión del prompt."""

    plazo_ms: int
    concurrencia: int
    version_del_prompt: str


@dataclass(frozen=True)
class _ResultadoDelRespaldo:
    """Lo que una llamada del respaldo entregó: sus propuestas o la causa por la que falló (RN-26)."""

    external_id: str
    criterio: str
    chunk_ids: tuple[str, ...]
    propuestas: tuple[PropuestaDePoblacion, ...] = ()
    fallo: RespaldoFallido | None = None


@dataclass(frozen=True)
class AplicabilidadCompleta:
    """La aplicabilidad de las fuentes con el camino textual aplicado, las afirmaciones omitidas y si hubo llamada al LLM."""

    fuentes: tuple[AplicabilidadDeFuente, ...]
    omitidas: int = 0
    invoco_al_llm: bool = False


class AplicabilidadTextual:
    def __init__(
        self,
        *,
        proponente: PoblacionTask,
        parametros: ParametrosDelRespaldo,
        soporte: VerificadorDeSoporte,
        terminos: ProhibitedTermsChecker,
        criterios_del: Callable[[str], Sequence[CriterioDeAplicabilidad]],
        reloj: Clock,
    ) -> None:
        self._proponente = proponente
        self._parametros = parametros
        self._soporte = soporte
        self._terminos = terminos
        self._criterios_del = criterios_del
        self._reloj = reloj

    async def completar(
        self,
        trace_id: str,
        tipo_de_cancer: str,
        fuentes: tuple[AplicabilidadDeFuente, ...],
        citables: Mapping[str, ChunkCitable],
    ) -> AplicabilidadCompleta:
        """Propone → valida cita y lenguaje → NLI → aplica la regla del catálogo a lo aceptado."""
        criterios = self._criterios_del(tipo_de_cancer)
        a_proponer = _fuentes_para_proponer(fuentes, criterios, citables)
        if not a_proponer:
            return AplicabilidadCompleta(
                fuentes
            )  # nada pendiente: el LLM no se invoca (US-122 AC-6, RN-02)
        inicio = self._reloj.ahora()
        resultados = await self._pedir_respaldo(a_proponer)
        propuestas = tuple(p for r in resultados for p in r.propuestas)
        plan, resultado = await self._aceptar_las_propuestas(trace_id, a_proponer, propuestas)
        fallidos = [r for r in resultados if r.fallo is not None]
        self._registrar_fallos(trace_id, fallidos)
        recuentos = recuentos_de_propuestas(a_proponer, propuestas, plan, resultado.aceptadas)
        self._registrar(trace_id, recuentos, inicio)
        con_valores = _con_valores_aceptados(fuentes, criterios, resultado.aceptadas)
        return AplicabilidadCompleta(
            _con_respaldo_fallido(con_valores, fallidos), resultado.omitidas, invoco_al_llm=True
        )

    async def _aceptar_las_propuestas(
        self,
        trace_id: str,
        fuentes: Sequence[FuenteParaProponer],
        propuestas: Sequence[PropuestaDePoblacion],
    ) -> tuple[PlanDePropuestas, ResultadoDePropuestas]:
        """Cita y lenguaje (RN-01, RN-23) y después el NLI con el chunk citado como premisa: solo lo soportado se acepta."""
        plan = planificar_propuestas(propuestas, fuentes, self._terminos.reglas_coincidentes)
        soportadas = await self._soporte.pares_soportados(trace_id, pares_para_el_nli(plan))
        return plan, aceptar_propuestas(plan, soportadas)

    async def _pedir_respaldo(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[_ResultadoDelRespaldo, ...]:
        """Una llamada por fuente y criterio pendiente, con a lo sumo ``concurrencia`` simultáneas (RN-22)."""
        semaforo = asyncio.Semaphore(self._parametros.concurrencia)
        return tuple(
            await asyncio.gather(
                *(
                    self._respaldar_un_criterio(
                        semaforo, FuenteParaProponer(fuente.external_id, (criterio,), fuente.chunks)
                    )
                    for fuente in fuentes
                    for criterio in fuente.criterios
                )
            )
        )

    async def _respaldar_un_criterio(
        self, semaforo: asyncio.Semaphore, fuente: FuenteParaProponer
    ) -> _ResultadoDelRespaldo:
        """El respaldo es secundario (RN-26): un fallo, un plazo vencido o el LLM caído degradan SOLO este criterio y nunca
        son ``LOCAL_LLM_UNAVAILABLE``. Cualquier otra excepción es un defecto y sube."""
        (criterio,) = fuente.criterios
        resultado = _ResultadoDelRespaldo(
            fuente.external_id, criterio.clave, tuple(c.chunk_id for c in fuente.chunks)
        )
        async with semaforo:
            try:
                async with asyncio.timeout(self._parametros.plazo_ms / 1000):
                    propuestas = tuple(await self._proponente.proponer(fuente))
            except TimeoutError:
                return replace(resultado, fallo=RespaldoFallido(CausaDeRespaldo.plazo))
            except FalloDelLlm:
                return replace(resultado, fallo=RespaldoFallido(CausaDeRespaldo.caido))
            except RespaldoFallido as fallo:
                return replace(resultado, fallo=fallo)
        return replace(resultado, propuestas=propuestas)

    @staticmethod
    def _registrar_fallos(trace_id: str, resultados: Sequence[_ResultadoDelRespaldo]) -> None:
        """Un evento por respaldo fallido: criterio, causa, ``finish_reason``, longitud de la salida, los ``chunkId`` del corpus
        público que recibió y ``traceId``. Nunca el valor, el texto de un fragmento, el prompt, la salida del LLM ni la
        pregunta (RN-14, regla común de l1d-291…294)."""
        for resultado in resultados:
            fallo = resultado.fallo
            if fallo is None:
                continue
            logger.warning(
                "event=aplicabilidad_respaldo_fallido criterio=%s causa=%s finish_reason=%s longitud=%d "
                "chunkIds=%s traceId=%s",
                resultado.criterio,
                fallo.causa.value,
                fallo.finish_reason or SIN_FINISH_REASON,
                fallo.longitud,
                ",".join(resultado.chunk_ids),
                trace_id,
            )

    def _registrar(
        self,
        trace_id: str,
        recuentos: Mapping[str, int],
        inicio: datetime,
    ) -> None:
        detalle = " ".join(f"{k}={v}" for k, v in recuentos.items())
        logger.info(
            "event=rag_query_poblacion_textual traceId=%s %s latenciaMs=%d nliModel=%s "
            "applicabilityPromptVersion=%s",
            trace_id,
            detalle,
            int((self._reloj.ahora() - inicio).total_seconds() * 1000),
            self._soporte.nli_model,
            self._parametros.version_del_prompt,
        )


def recuentos_de_propuestas(
    fuentes: Sequence[FuenteParaProponer],
    propuestas: Sequence[PropuestaDePoblacion],
    plan: PlanDePropuestas,
    aceptadas: Sequence[PropuestaDePoblacion],
) -> dict[str, int]:
    """Solo recuentos para el log: nunca un valor propuesto, un ``chunkId`` ni texto de un chunk (RN-10, RN-25)."""
    motivos = [motivo for _, motivo in plan.rechazadas]
    return {
        "fuentes": len(fuentes),
        "propuestas": len(propuestas),
        "aceptadas": len(aceptadas),
        "rechazadasPorCita": motivos.count(MotivoDeRechazo.cita_fuera_de_la_fuente),
        "rechazadasPorLenguaje": motivos.count(MotivoDeRechazo.lenguaje_no_permitido),
        "rechazadasPorNli": len(plan.por_validar) - len(aceptadas),
    }


def _fuentes_para_proponer(
    fuentes: Sequence[AplicabilidadDeFuente],
    criterios: Sequence[CriterioDeAplicabilidad],
    citables: Mapping[str, ChunkCitable],
) -> tuple[FuenteParaProponer, ...]:
    """Una entrada por fuente con criterios ``pendiente``: esos criterios y todos sus chunks recuperados (ADR-47)."""
    pedidas: list[FuenteParaProponer] = []
    for fuente in fuentes:
        pendientes = criterios_pendientes(fuente.poblacion, fuente.criterios, criterios)
        if pendientes:
            pedidas.append(
                FuenteParaProponer(fuente.external_id, pendientes, _chunks_de(fuente, citables))
            )
    return tuple(pedidas)


def _chunks_de(
    fuente: AplicabilidadDeFuente, citables: Mapping[str, ChunkCitable]
) -> tuple[ChunkDeFuente, ...]:
    documento = fuente.mejor_chunk.chunk.document_id
    delanteros = ordenar_por_relevancia(
        [c.chunk for c in citables.values() if c.chunk.document_id == documento]
    )
    return tuple(ChunkDeFuente(c.chunk_id, c.chunk_text) for c in delanteros)


def _con_valores_aceptados(
    fuentes: Sequence[AplicabilidadDeFuente],
    criterios: Sequence[CriterioDeAplicabilidad],
    aceptadas: Sequence[PropuestaDePoblacion],
) -> tuple[AplicabilidadDeFuente, ...]:
    catalogo = {c.clave: c for c in criterios}
    por_fuente_y_criterio = {(p.external_id, p.criterio): p for p in aceptadas}

    def evaluado(fuente: AplicabilidadDeFuente, criterio: CriterioEvaluado) -> CriterioEvaluado:
        propuesta = por_fuente_y_criterio.get((fuente.external_id, criterio.clave))
        if propuesta is None:
            return criterio
        return con_valor_textual(catalogo[criterio.clave], criterio, propuesta)

    return tuple(
        fuente.con_criterios(tuple(evaluado(fuente, c) for c in fuente.criterios))
        for fuente in fuentes
    )


def _con_respaldo_fallido(
    fuentes: Sequence[AplicabilidadDeFuente], fallidos: Sequence[_ResultadoDelRespaldo]
) -> tuple[AplicabilidadDeFuente, ...]:
    """Los criterios cuyo respaldo falló, ``desconocido`` con ``respaldo_fallido``; el resto de la fuente no cambia."""
    marcados = {(r.external_id, r.criterio) for r in fallidos}
    if not marcados:
        return tuple(fuentes)
    return tuple(
        fuente.con_criterios(
            tuple(
                degradar_a_respaldo_fallido(c) if (fuente.external_id, c.clave) in marcados else c
                for c in fuente.criterios
            )
        )
        for fuente in fuentes
    )
