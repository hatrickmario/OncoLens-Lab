"""Nodo ``caso`` del grafo del chat (US-260, ADR-34, ADR-51): situación, resumen y evolución del caso del paciente.

Sustituye el esqueleto de la intención ``caso`` (se inyecta en ``construir_grafo(capacidades=...)``). Etapas, una por método:
pedir al LLM local afirmaciones con ``factRefs`` → omitir las que no enlazan a un hecho del turno (sin invocar el NLI) →
verificar las demás con NLI contra la verbalización determinista de los hechos que citan → ordenar por día relativo.
Lo que no enlaza o no pasa el NLI se omite y se suma en ``omitidas_del_nodo``; ``validar`` lo cuenta en ``omittedClaims``
(RN-01). Sin NLI configurado o sin LLM local el turno falla cerrado (``LOCAL_LLM_UNAVAILABLE``): nunca una afirmación sin
verificar y nunca la nube (RN-12). Logs: solo conteos y ``traceId``, jamás el texto de una afirmación o de un hecho (RN-10).
"""

from __future__ import annotations

import logging
from typing import Any

from app.application.chat.grafo import (
    ESQUEMA_DEL_TURNO,
    ConfiguracionDelGrafo,
    EstadoDelGrafo,
    propuestas_de_la_salida,
)
from app.application.errores import LlmLocalNoDisponibleError, NliNoDisponibleError
from app.application.ports import ContadorDeTokens, FalloDelLlm, LlmClient
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.chat.enlaces_del_caso import (
    cabe_en_el_nli,
    filtrar_afirmaciones_sin_enlace,
    ordenar_series_por_dia_relativo,
    premisa_de_los_hechos,
)
from app.domain.chat.estado import EstadoDelHilo
from app.domain.chat.memoria import ventana_de_memoria
from app.domain.chat.turno import HechoDelCaso, PropuestaDelTurno
from app.domain.nli import ParNli
from app.prompts.chat_caso import armar_prompt_del_caso

logger = logging.getLogger(__name__)


class NodoCaso:
    def __init__(
        self,
        *,
        llm: LlmClient,
        contador: ContadorDeTokens,
        configuracion: ConfiguracionDelGrafo,
        soporte: VerificadorDeSoporte | None,
        max_palabras_por_afirmacion: int,
    ) -> None:
        self._llm = llm
        self._contador = contador
        self._configuracion = configuracion
        self._soporte = soporte
        self._max_palabras = max_palabras_por_afirmacion

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        trace_id = estado["trace_id"]
        crudo = await self._pedir_afirmaciones_al_llm(estado)
        propuestas = propuestas_de_la_salida(crudo, trace_id)
        enlazadas = self._con_enlace_a_los_hechos(propuestas, estado["hechos"])
        soportadas = await self._soportadas_por_los_hechos(enlazadas, estado["hechos"], trace_id)
        omitidas = len(propuestas) - len(soportadas)
        logger.info(
            "event=chat_caso traceId=%s afirmaciones=%d soportadas=%d",
            trace_id,
            len(propuestas),
            len(soportadas),
        )
        return {
            "propuestas": ordenar_series_por_dia_relativo(soportadas, estado["hechos"]),
            "omitidas_del_nodo": omitidas,
        }

    async def _pedir_afirmaciones_al_llm(self, estado: EstadoDelGrafo) -> str:
        hilo = estado.get("hilo") or EstadoDelHilo()
        ventana = ventana_de_memoria(
            hilo.turnos, self._configuracion.presupuesto_de_memoria, self._contador.contar
        )
        prompt = armar_prompt_del_caso(hilo, estado["pregunta"], estado["hechos"], ventana)
        try:
            return await self._llm.completar_json(
                prompt.usuario, ESQUEMA_DEL_TURNO, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_generacion_llm_fallo traceId=%s", estado["trace_id"])
            raise LlmLocalNoDisponibleError() from None

    def _con_enlace_a_los_hechos(
        self, propuestas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        con_enlace, _ = filtrar_afirmaciones_sin_enlace(propuestas, {h.ref for h in hechos})
        return tuple(p for p in con_enlace if cabe_en_el_nli(p.texto, self._max_palabras))

    async def _soportadas_por_los_hechos(
        self,
        enlazadas: tuple[PropuestaDelTurno, ...],
        hechos: tuple[HechoDelCaso, ...],
        trace_id: str,
    ) -> tuple[PropuestaDelTurno, ...]:
        """El NLI contra la verbalización de los hechos citados (ADR-34); sin NLI o con un fallo suyo, falla cerrado (RN-01)."""
        soporte = self._soporte
        if soporte is None:
            logger.warning("event=chat_caso_sin_nli traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError()
        pares = [ParNli(premisa_de_los_hechos(p.fact_refs, hechos), p.texto) for p in enlazadas]
        try:
            veredictos = await soporte.pares_soportados(trace_id, pares)
        except NliNoDisponibleError:
            raise LlmLocalNoDisponibleError() from None
        return tuple(p for p, soporta in zip(enlazadas, veredictos, strict=True) if soporta)
