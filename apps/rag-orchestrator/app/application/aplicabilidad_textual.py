"""``AplicabilidadTextual``: camino textual de la aplicabilidad (US-123, FR-25, RN-01, design D8).

Para lo que la fuente no trae estructurado, el LLM solo **propone** el valor del estudio con una cita; el valor se acepta
únicamente si la cita es un chunk recuperado de esa fuente en esta consulta, el lenguaje es permitido (RN-23) y el NLI da
``entailment`` sobre el umbral con ese chunk como premisa. El estado lo asigna la regla del catálogo (la misma de
``ApplicabilityService``), nunca el LLM, y el valor del paciente se copia del contexto (ADR-34).

Falla cerrada: un fallo del LLM de aplicabilidad es ``LlmLocalNoDisponibleError`` y uno del NLI,
``NliNoDisponibleError``; nunca se devuelve aplicabilidad sin validar. Logs: solo conteos, latencia, ``nliModel``,
la versión del prompt y ``traceId``; jamás el valor propuesto, el texto de un chunk ni un ``chunkId`` (RN-10, RN-25).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.application.aplicabilidad import AplicabilidadDeFuente, ApplicabilityService
from app.application.chunk_citable import ChunkCitable
from app.application.errores import ErrorDeAplicacion, LlmLocalNoDisponibleError
from app.application.ports import ApplicabilityTextProposer, Clock, ProhibitedTermsChecker
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_text import (
    ChunkDeFuente,
    FuenteParaProponer,
    MotivoDeRechazo,
    PlanDePropuestas,
    PropuestaDePoblacion,
    aceptar_propuestas,
    con_valor_textual,
    criterios_pendientes_de_texto,
    pares_para_el_nli,
    planificar_propuestas,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.relevance import ordenar_por_relevancia
from app.prompts.aplicabilidad_texto import VERSION_DEL_PROMPT_APLICABILIDAD

logger = logging.getLogger(__name__)


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
        proponente: ApplicabilityTextProposer,
        soporte: VerificadorDeSoporte,
        terminos: ProhibitedTermsChecker,
        estructurada: ApplicabilityService,
        reloj: Clock,
    ) -> None:
        self._proponente = proponente
        self._soporte = soporte
        self._terminos = terminos
        self._estructurada = estructurada
        self._reloj = reloj

    async def completar(
        self,
        trace_id: str,
        tipo_de_cancer: str,
        fuentes: tuple[AplicabilidadDeFuente, ...],
        citables: Mapping[str, ChunkCitable],
    ) -> AplicabilidadCompleta:
        """Propone → valida cita y lenguaje → NLI → aplica la regla del catálogo a lo aceptado."""
        criterios = self._estructurada.criterios_del(tipo_de_cancer)
        a_proponer = _fuentes_para_proponer(fuentes, criterios, citables)
        if not a_proponer:
            return AplicabilidadCompleta(
                fuentes
            )  # nada pendiente: el LLM no se invoca (US-122 AC-6, RN-02)
        inicio = self._reloj.ahora()
        propuestas = await self._pedir_propuestas(trace_id, a_proponer)
        plan = planificar_propuestas(propuestas, a_proponer, self._terminos.reglas_coincidentes)
        soportadas = await self._soporte.pares_soportados(trace_id, pares_para_el_nli(plan))
        resultado = aceptar_propuestas(plan, soportadas)
        recuentos = recuentos_de_propuestas(a_proponer, propuestas, plan, resultado.aceptadas)
        self._registrar(trace_id, recuentos, inicio)
        return AplicabilidadCompleta(
            _con_valores_aceptados(fuentes, criterios, resultado.aceptadas),
            resultado.omitidas,
            invoco_al_llm=True,
        )

    async def _pedir_propuestas(
        self, trace_id: str, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[PropuestaDePoblacion, ...]:
        """Todo fallo del proponente, o una salida que no son propuestas, es ``LOCAL_LLM_UNAVAILABLE`` sin detalle."""
        try:
            propuestas = tuple(await self._proponente.proponer(fuentes))
            if not all(isinstance(p, PropuestaDePoblacion) for p in propuestas):
                raise ValueError("el proponente debe devolver propuestas de población")
        except ErrorDeAplicacion:
            raise
        except Exception as error:  # noqa: BLE001 - todo fallo del proponente es "modelo local no disponible"
            logger.warning(
                "event=aplicabilidad_textual_fallo error=%s traceId=%s",
                type(error).__name__,
                trace_id,
            )
            raise LlmLocalNoDisponibleError() from None
        return propuestas

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
            VERSION_DEL_PROMPT_APLICABILIDAD,
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
    """Una entrada por fuente con criterios pendientes: esos criterios y todos sus chunks recuperados (design D2)."""
    pedidas: list[FuenteParaProponer] = []
    for fuente in fuentes:
        pendientes = criterios_pendientes_de_texto(fuente.criterios, criterios)
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
