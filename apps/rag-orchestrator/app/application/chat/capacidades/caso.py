"""Nodo ``caso`` del grafo del chat (US-260, US-261, ADR-34, ADR-51): situación, evolución, tratamientos, exámenes y periodos.

Sustituye el esqueleto de la intención ``caso`` (se inyecta en ``construir_grafo(capacidades=...)``). Etapas, una por método:
acotar los hechos al periodo de la pregunta → pedir al LLM local afirmaciones con ``factRefs`` → omitir las que no enlazan a
un hecho del turno (sin invocar el NLI) → resolver cada una según su tipo:

- ``documentado``: el LLM solo elige los ``factRefs``; el código escribe un bloque por hecho con su descripción determinista
  (``bloques_documentados``). No pasa NLI: su texto *es* el hecho (ADR-34).
- ``interpretacion``: pasa el chequeo numérico (ninguna cifra o unidad fuera de la descripción de sus hechos) y después el NLI
  contra esa descripción. Una salida sin ``kind`` es documentado si su texto es la descripción de sus hechos (atajo por
  identidad) e interpretación si es una paráfrasis.

Una interpretación que cita un valor de un par en conflicto (``CaseFact.conflictWith``) sin su contraparte se omite antes
del NLI: la IA no resuelve (US-262, AC-T3.2). Una pregunta de contradicciones no llega al LLM: el turno compone los bloques
``conflicto`` con código (``contradicciones_del_caso``).

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

from app.application.chat.capacidades.contradicciones_del_caso import turno_de_contradicciones
from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo, pedir_afirmaciones
from app.application.errores import LlmLocalNoDisponibleError, NliNoDisponibleError
from app.application.ports import ContadorDeTokens, LlmClient
from app.application.prompt_builder import PromptSeparado
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.atribucion import FormaDeAfirmacion, validar_forma_de_afirmacion
from app.domain.chat.bloques_documentados import bloques_documentados
from app.domain.chat.chequeo_numerico import cifras_sostenidas_por_la_descripcion
from app.domain.chat.contradicciones import (
    afirmaciones_que_resuelven_conflicto,
    es_pregunta_de_contradicciones,
)
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
from app.domain.chat.tendencia import tiene_verbo_de_tendencia
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
        texto_sin_datos_en_periodo: str,
        texto_sin_fecha: str,
        etiqueta_de_conflicto: str,
        texto_sin_contradicciones: str,
    ) -> None:
        self._llm = llm
        self._contador = contador
        self._configuracion = configuracion
        self._soporte = soporte
        self._max_palabras = max_palabras_por_afirmacion
        self._texto_sin_datos_en_periodo = texto_sin_datos_en_periodo
        self._texto_sin_fecha = texto_sin_fecha
        self._etiqueta_de_conflicto = etiqueta_de_conflicto
        self._texto_sin_contradicciones = texto_sin_contradicciones

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        trace_id = estado["trace_id"]
        todos = estado["hechos"]
        if es_pregunta_de_contradicciones(estado["pregunta"]):
            return turno_de_contradicciones(
                todos,
                etiqueta_de_conflicto=self._etiqueta_de_conflicto,
                texto_sin_contradicciones=self._texto_sin_contradicciones,
                trace_id=trace_id,
            )
        dias_del_periodo = periodo_de_la_pregunta(estado["pregunta"])
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
        enlazadas = self._sin_las_que_resuelven_un_conflicto(
            self._clasificadas(self._con_enlace_y_forma_de_afirmacion(propuestas, hechos), hechos),
            todos,
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
            **self._ajustes_del_periodo(todos, hechos, dias_del_periodo),
        }

    def _ajustes_del_periodo(
        self,
        todos: tuple[HechoDelCaso, ...],
        del_periodo: tuple[HechoDelCaso, ...],
        dias: int | None,
    ) -> dict[str, Any]:
        """Lo que el periodo le dice al usuario además de las afirmaciones (texto fijo, sin datos del paciente): un aviso no
        bloqueante si dejó fuera hechos sin fecha confiable (no pudieron ubicarse) y, si no quedó ningún hecho en el
        periodo pero el expediente sí tiene datos, la limitación que lo distingue de un expediente sin datos."""
        if dias is None:
            return {}
        sin_fecha = sum(1 for h in todos if h.dia_relativo is None)
        ajustes: dict[str, Any] = {}
        if sin_fecha:
            ajustes["avisos_del_nodo"] = (self._texto_sin_fecha.replace("<n>", str(sin_fecha)),)
        if todos and not del_periodo:
            ajustes["limitacion_del_nodo"] = self._texto_sin_datos_en_periodo
        return ajustes

    def _con_enlace_y_forma_de_afirmacion(
        self, propuestas: tuple[PropuestaDelTurno, ...], hechos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """Solo sigue lo que enlaza a un hecho del turno y tiene forma de afirmación (no excede ``claim_max_words``, sin
        modal normativo ni artefactos): lo demás se omite sin llegar al NLI, que fallaría cerrado con una hipótesis larga.
        Un ``documentado`` que eligió el LLM no pasa por la forma: su texto se descarta."""
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
            if p.tipo is not None
            else replace(
                p,
                tipo=TipoDeBloque.documentado
                if es_la_descripcion_de(p.texto, p.fact_refs, hechos)
                else TipoDeBloque.interpretacion,
            )
            for p in enlazadas
        )

    @staticmethod
    def _sin_las_que_resuelven_un_conflicto(
        enlazadas: tuple[PropuestaDelTurno, ...], todos: tuple[HechoDelCaso, ...]
    ) -> tuple[PropuestaDelTurno, ...]:
        """Antes del NLI, fuera la interpretación que cita un valor de un par en conflicto sin su contraparte: la IA no
        resuelve (AC-T3.2). Un ``documentado`` no cuenta: su texto lo escribe el código y ya dice «en conflicto con otro
        dato». Se mira contra TODOS los hechos del turno: el periodo de la pregunta no deshace un conflicto."""
        resuelven = {
            id(p)
            for p in afirmaciones_que_resuelven_conflicto(
                [p for p in enlazadas if p.tipo is TipoDeBloque.interpretacion], todos
            )
        }
        return tuple(p for p in enlazadas if id(p) not in resuelven)

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
        veredictos = await self._interpretaciones_sostenidas(
            soporte, interpretaciones, hechos, trace_id
        )
        sostenidas = {id(p) for p, ok in zip(interpretaciones, veredictos, strict=True) if ok}
        return tuple(
            p for p in enlazadas if p.tipo is TipoDeBloque.documentado or id(p) in sostenidas
        )

    @staticmethod
    async def _interpretaciones_sostenidas(
        soporte: VerificadorDeSoporte,
        interpretaciones: Sequence[PropuestaDelTurno],
        hechos: tuple[HechoDelCaso, ...],
        trace_id: str,
    ) -> list[bool]:
        """Por interpretación, si la sostiene la descripción de sus hechos (ADR-34): sin cifras ajenas a ella (chequeo
        numérico) ni verbos de tendencia, antes del NLI, e idéntica a ella (soporte por identidad) o con el NLI a favor."""
        premisas = [describir_hechos(p.fact_refs, hechos) for p in interpretaciones]
        sin_cifras_ajenas = [
            cifras_sostenidas_por_la_descripcion(p.texto, premisa)
            and not tiene_verbo_de_tendencia(p.texto)
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
                    texto=b.texto, fact_refs=b.fact_refs, tipo=TipoDeBloque.documentado
                )
                for b in bloques_documentados(propuesta.fact_refs, hechos)
            )
        return tuple(resultado)


def _es_documentado_declarado(propuesta: PropuestaDelTurno) -> bool:
    return propuesta.tipo is TipoDeBloque.documentado
