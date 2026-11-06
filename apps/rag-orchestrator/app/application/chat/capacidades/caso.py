"""Nodo ``caso`` del grafo del chat (US-260, US-261, ADR-34, ADR-51): situación, evolución, tratamientos, exámenes y periodos.

Sustituye el esqueleto de la intención ``caso`` (se inyecta en ``construir_grafo(capacidades=...)``). Etapas, una por método:
acotar los hechos al periodo de la pregunta → pedir al LLM local afirmaciones con ``factRefs`` → omitir las que no enlazan a
un hecho del turno (sin invocar el NLI) → resolver cada una según su tipo:

- ``documentado``: el LLM solo elige los ``factRefs``; el código escribe un bloque por hecho con su descripción determinista
  (``bloques_documentados``). No pasa NLI: su texto *es* el hecho (ADR-34).
- ``interpretacion``: pasa el chequeo numérico (ninguna cifra o unidad fuera de la descripción de sus hechos) y después el NLI
  contra esa descripción. Una salida sin ``kind`` es documentado si su texto es la descripción de sus hechos (atajo por
  identidad) e interpretación si es una paráfrasis.

Lo que no enlaza, no pasa el chequeo numérico o no pasa el NLI se omite y se suma en ``omitidas_del_nodo``; ``validar`` lo
cuenta en ``omittedClaims`` (RN-01). Sin NLI configurado o sin LLM local el turno falla cerrado (``LOCAL_LLM_UNAVAILABLE``):
nunca una afirmación sin verificar y nunca la nube (RN-12). Logs: solo conteos, el periodo en días y ``traceId``, jamás el
texto de una afirmación o de un hecho (RN-10).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo, pedir_afirmaciones
from app.application.errores import LlmLocalNoDisponibleError, NliNoDisponibleError
from app.application.ports import ContadorDeTokens, LlmClient
from app.application.prompt_builder import PromptSeparado
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.atribucion import FormaDeAfirmacion, validar_forma_de_afirmacion
from app.domain.chat.bloques_documentados import bloques_documentados
from app.domain.chat.chequeo_numerico import cifras_sostenidas_por_la_descripcion
from app.domain.chat.descripcion_de_hechos import describir_hechos, es_la_descripcion_de
from app.domain.chat.enlaces_del_caso import (
    filtrar_afirmaciones_sin_enlace,
    ordenar_series_por_dia_relativo,
)
from app.domain.chat.estado import EstadoDelHilo, TurnoPrevio
from app.domain.chat.periodo_de_la_pregunta import (
    filtrar_hechos_por_periodo,
    periodo_de_la_pregunta,
)
from app.domain.chat.turno import HechoDelCaso, PropuestaDelTurno, TipoDeBloque
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
        dias_del_periodo = periodo_de_la_pregunta(estado["pregunta"])
        todos = estado["hechos"]
        # Con un periodo en la pregunta, solo los hechos de esos días; sin periodo, todos (US-261 AC-3).
        hechos = (
            todos
            if dias_del_periodo is None
            else filtrar_hechos_por_periodo(todos, dias_del_periodo)
        )

        def armar(hilo: EstadoDelHilo, ventana: Sequence[TurnoPrevio]) -> PromptSeparado:
            return armar_prompt_del_caso(hilo, estado["pregunta"], hechos, ventana)

        propuestas = await pedir_afirmaciones(
            self._llm, self._contador, self._configuracion, estado, armar
        )
        enlazadas = self._clasificadas(
            self._con_enlace_y_forma_de_afirmacion(propuestas, hechos), hechos
        )
        soportadas = await self._soportadas(enlazadas, hechos, trace_id)
        logger.info(
            "event=chat_caso traceId=%s afirmaciones=%d soportadas=%d periodo_dias=%s",
            trace_id,
            len(propuestas),
            len(soportadas),
            dias_del_periodo,
        )
        return {
            "propuestas": ordenar_series_por_dia_relativo(
                self._con_un_bloque_por_hecho_documentado(soportadas, hechos), hechos
            ),
            "omitidas_del_nodo": len(propuestas) - len(soportadas),
        }

    def _con_enlace_y_forma_de_afirmacion(
        self, propuestas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """Solo sigue lo que enlaza a un hecho del turno y tiene forma de afirmación (no excede ``claim_max_words``, sin
        modal normativo ni artefactos): lo demás se omite sin llegar al NLI, que fallaría cerrado con una hipótesis larga.
        Un ``documentado`` declarado no pasa por la forma: su texto se descarta."""
        con_enlace, _ = filtrar_afirmaciones_sin_enlace(propuestas, {h.ref for h in hechos})
        return tuple(
            p
            for p in con_enlace
            if _es_documentado_declarado(p)
            or validar_forma_de_afirmacion(p.texto, self._max_palabras) is FormaDeAfirmacion.valida
        )

    @staticmethod
    def _clasificadas(
        enlazadas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """El tipo definitivo de cada afirmación: el que eligió el LLM o, si no eligió, el que su texto demuestra (idéntica
        a la descripción de sus hechos = documentado; toda paráfrasis = interpretación)."""
        return tuple(
            p
            if p.declarado
            else replace(
                p,
                tipo=TipoDeBloque.documentado
                if es_la_descripcion_de(p.texto, p.fact_refs, hechos)
                else TipoDeBloque.interpretacion,
            )
            for p in enlazadas
        )

    async def _soportadas(
        self,
        enlazadas: tuple[PropuestaDelTurno, ...],
        hechos: tuple[HechoDelCaso, ...],
        trace_id: str,
    ) -> tuple[PropuestaDelTurno, ...]:
        """Las afirmaciones con soporte: toda ``documentado`` (su texto lo pone el código) y las ``interpretacion`` que
        pasan el chequeo numérico y el NLI. Sin NLI o con un fallo suyo, falla cerrado (RN-01)."""
        soporte = self._soporte
        if soporte is None:
            logger.warning("event=chat_caso_sin_nli traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError()
        interpretaciones = [p for p in enlazadas if p.tipo is TipoDeBloque.interpretacion]
        sostenidas = iter(
            await self._interpretaciones_sostenidas(soporte, interpretaciones, hechos, trace_id)
        )
        return tuple(p for p in enlazadas if p.tipo is TipoDeBloque.documentado or next(sostenidas))

    @staticmethod
    async def _interpretaciones_sostenidas(
        soporte: VerificadorDeSoporte,
        interpretaciones: Sequence[PropuestaDelTurno],
        hechos: tuple[HechoDelCaso, ...],
        trace_id: str,
    ) -> list[bool]:
        """Por interpretación, si la sostiene la descripción de sus hechos (ADR-34): sin cifras ajenas a ella (chequeo
        numérico, antes del NLI) e idéntica a ella (soporte por identidad) o con el NLI a favor."""
        premisas = [describir_hechos(p.fact_refs, hechos) for p in interpretaciones]
        sin_cifras_ajenas = [
            cifras_sostenidas_por_la_descripcion(p.texto, premisa)
            for p, premisa in zip(interpretaciones, premisas, strict=True)
        ]
        sostenidas = [
            ok and es_la_descripcion_de(p.texto, p.fact_refs, hechos)
            for p, ok in zip(interpretaciones, sin_cifras_ajenas, strict=True)
        ]
        a_clasificar = [i for i, ok in enumerate(sin_cifras_ajenas) if ok and not sostenidas[i]]
        pares = [ParNli(premisas[i], interpretaciones[i].texto) for i in a_clasificar]
        try:
            veredictos = await soporte.pares_soportados(trace_id, pares)
        except NliNoDisponibleError:
            raise LlmLocalNoDisponibleError() from None
        for i, soportada in zip(a_clasificar, veredictos, strict=True):
            sostenidas[i] = soportada
        return sostenidas

    @staticmethod
    def _con_un_bloque_por_hecho_documentado(
        soportadas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """Cada ``documentado`` se expande a un bloque por hecho con el texto del código; la interpretación sigue igual."""
        resultado: list[PropuestaDelTurno] = []
        for propuesta in soportadas:
            if propuesta.tipo is not TipoDeBloque.documentado:
                resultado.append(propuesta)
                continue
            resultado.extend(
                PropuestaDelTurno(
                    b.texto, b.fact_refs, (), TipoDeBloque.documentado, declarado=True
                )
                for b in bloques_documentados(propuesta.fact_refs, hechos)
            )
        return tuple(resultado)


def _es_documentado_declarado(propuesta: PropuestaDelTurno) -> bool:
    return propuesta.declarado and propuesta.tipo is TipoDeBloque.documentado
