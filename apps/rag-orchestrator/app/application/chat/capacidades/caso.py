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
from collections.abc import Sequence
from typing import Any

from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo, pedir_afirmaciones
from app.application.errores import LlmLocalNoDisponibleError, NliNoDisponibleError
from app.application.ports import ContadorDeTokens, LlmClient
from app.application.prompt_builder import PromptSeparado
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.atribucion import FormaDeAfirmacion, validar_forma_de_afirmacion
from app.domain.chat.descripcion_de_hechos import describir_hechos, es_la_descripcion_de
from app.domain.chat.enlaces_del_caso import (
    filtrar_afirmaciones_sin_enlace,
    ordenar_series_por_dia_relativo,
)
from app.domain.chat.estado import EstadoDelHilo, TurnoPrevio
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
        hechos = estado["hechos"]

        def armar(hilo: EstadoDelHilo, ventana: Sequence[TurnoPrevio]) -> PromptSeparado:
            return armar_prompt_del_caso(hilo, estado["pregunta"], hechos, ventana)

        propuestas = await pedir_afirmaciones(
            self._llm, self._contador, self._configuracion, estado, armar
        )
        enlazadas = self._con_enlace_y_forma_de_afirmacion(propuestas, hechos)
        soportadas = await self._soportadas_por_los_hechos(enlazadas, hechos, trace_id)
        omitidas = len(propuestas) - len(soportadas)
        logger.info(
            "event=chat_caso traceId=%s afirmaciones=%d soportadas=%d",
            trace_id,
            len(propuestas),
            len(soportadas),
        )
        return {
            "propuestas": ordenar_series_por_dia_relativo(soportadas, hechos),
            "omitidas_del_nodo": omitidas,
        }

    def _con_enlace_y_forma_de_afirmacion(
        self, propuestas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """Solo sigue lo que enlaza a un hecho del turno y tiene forma de afirmación (no excede ``claim_max_words``, sin
        modal normativo ni artefactos): lo demás se omite sin llegar al NLI, que fallaría cerrado con una hipótesis larga."""
        con_enlace, _ = filtrar_afirmaciones_sin_enlace(propuestas, {h.ref for h in hechos})
        return tuple(
            p
            for p in con_enlace
            if validar_forma_de_afirmacion(p.texto, self._max_palabras) is FormaDeAfirmacion.valida
        )

    async def _soportadas_por_los_hechos(
        self,
        enlazadas: tuple[PropuestaDelTurno, ...],
        hechos: tuple[HechoDelCaso, ...],
        trace_id: str,
    ) -> tuple[PropuestaDelTurno, ...]:
        """Soporte de cada afirmación enlazada (ADR-34): idéntica a la descripción de sus hechos → soportada por identidad;
        toda paráfrasis → NLI contra esa descripción. Sin NLI o con un fallo suyo, falla cerrado (RN-01)."""
        soporte = self._soporte
        if soporte is None:
            logger.warning("event=chat_caso_sin_nli traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError()
        identicas = [es_la_descripcion_de(p.texto, p.fact_refs, hechos) for p in enlazadas]
        pendientes = [p for p, identica in zip(enlazadas, identicas, strict=True) if not identica]
        pares = [ParNli(describir_hechos(p.fact_refs, hechos), p.texto) for p in pendientes]
        try:
            veredictos = iter(await soporte.pares_soportados(trace_id, pares))
        except NliNoDisponibleError:
            raise LlmLocalNoDisponibleError() from None
        return tuple(
            p
            for p, identica in zip(enlazadas, identicas, strict=True)
            if identica or next(veredictos)
        )
