"""Grafo del turno del chat (US-259, ADR-51, design D1): ``enrutar`` → nodo de capacidad → ``validar``.

LangGraph solo orquesta el turno y su estado efímero; los nodos llaman a los puertos hexagonales (``LlmClient``,
``ContadorDeTokens``) y LangChain no sustituye a ningún adapter. Los cuatro nodos de capacidad (``caso``, ``faltantes``,
``evidencia`` y ``fuentes_limitaciones``) son esqueletos: piden al LLM afirmaciones sobre los hechos del caso y las dejan
pasar por el mismo ``validar``; su contenido propio llega con US-260…US-266. ``fuera_de_alcance`` y ``no_clasificada`` son
mensajes del sistema deterministas: no entran a ningún nodo de generación.

El estado del hilo (``hilo``) es lo único que sobrevive entre turnos; los campos del turno (pregunta, hechos) se vacían al
cerrar. Nunca hay ``patientId`` ni ``pseudoPatientId`` en el estado (RN-10, RN-11).
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, NamedTuple, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.application.errores import LlmLocalNoDisponibleError, LlmSalidaInvalidaError
from app.application.ports import ContadorDeTokens, FalloDelLlm, LlmClient
from app.domain.chat.enrutado import clasificar_por_reglas, es_fuera_de_alcance
from app.domain.chat.estado import (
    INTENCIONES_CLASIFICABLES,
    EstadoDelHilo,
    Intencion,
    TurnoPrevio,
    estado_tras_el_turno,
)
from app.domain.chat.memoria import ventana_de_memoria
from app.domain.chat.mensajes import MENSAJE_FUERA_DE_ALCANCE, MENSAJE_NO_CLASIFICADA
from app.domain.chat.soporte import afirmacion_tiene_soporte_del_turno
from app.domain.chat.turno import (
    BLOQUE_DOCUMENTADO,
    BLOQUE_LIMITACION,
    BloqueDelTurno,
    HechoDelCaso,
    PropuestaDelTurno,
)
from app.prompts.chat import armar_prompt_de_clasificacion, armar_prompt_del_turno

logger = logging.getLogger(__name__)


class EstadoDelGrafo(TypedDict, total=False):
    # Entradas del turno (se vacían al cerrar).
    pregunta: str
    hechos: tuple[HechoDelCaso, ...]
    tipo_del_contexto: str
    clasificacion_de_datos: str
    trace_id: str
    # Lo único que sobrevive entre turnos, junto con el resultado del último.
    hilo: EstadoDelHilo
    intencion: Intencion
    propuestas: tuple[PropuestaDelTurno, ...]
    bloques: tuple[BloqueDelTurno, ...]
    omitidas: int


class _Clasificacion(BaseModel):
    """Esquema interno de la clasificación con el LLM (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    intent: str


class _AfirmacionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text", min_length=1)
    fact_refs: list[str] = Field(alias="factRefs")
    citas: list[str] = Field(alias="citations")


class _SalidaDelTurno(BaseModel):
    """Esquema interno de la generación de un nodo de capacidad (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    afirmaciones: list[_AfirmacionCruda] = Field(alias="claims")


ESQUEMA_DE_CLASIFICACION: dict[str, Any] = _Clasificacion.model_json_schema()
ESQUEMA_DE_CLASIFICACION["properties"]["intent"]["enum"] = [
    i.value for i in INTENCIONES_CLASIFICABLES
]
ESQUEMA_DEL_TURNO: dict[str, Any] = _SalidaDelTurno.model_json_schema()

Nodo = Callable[[EstadoDelGrafo], Awaitable[dict[str, Any]]]


class ConfiguracionDelGrafo(NamedTuple):
    presupuesto_de_memoria: int
    terminos_por_tipo: Mapping[str, frozenset[str]]


def construir_grafo(
    *,
    llm: LlmClient,
    contador: ContadorDeTokens,
    configuracion: ConfiguracionDelGrafo,
    guardado: BaseCheckpointSaver,
) -> Any:
    """El ``StateGraph`` compilado con el ``InMemorySaver`` que le entrega el registro de hilos."""
    nodos = _NodosDelTurno(llm, contador, configuracion)
    grafo = StateGraph(EstadoDelGrafo)
    grafo.add_node("enrutar", nodos.enrutar)
    grafo.add_node("mensaje_del_sistema", nodos.mensaje_del_sistema)
    for intencion in INTENCIONES_CLASIFICABLES:
        grafo.add_node(intencion.value, nodos.nodo_de_capacidad(intencion))
        grafo.add_edge(intencion.value, "validar")
    grafo.add_node("validar", nodos.validar)
    grafo.add_edge(START, "enrutar")
    grafo.add_conditional_edges("enrutar", _siguiente_nodo)
    grafo.add_edge("mensaje_del_sistema", END)
    grafo.add_edge("validar", END)
    return grafo.compile(checkpointer=guardado)


def _siguiente_nodo(estado: EstadoDelGrafo) -> str:
    intencion = estado["intencion"]
    return intencion.value if intencion in INTENCIONES_CLASIFICABLES else "mensaje_del_sistema"


class _NodosDelTurno:
    def __init__(
        self, llm: LlmClient, contador: ContadorDeTokens, configuracion: ConfiguracionDelGrafo
    ) -> None:
        self._llm = llm
        self._contador = contador
        self._configuracion = configuracion

    async def enrutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        pregunta = estado["pregunta"]
        if es_fuera_de_alcance(
            pregunta, estado["tipo_del_contexto"], self._configuracion.terminos_por_tipo
        ):
            return {"intencion": Intencion.fuera_de_alcance}
        intencion = clasificar_por_reglas(pregunta) or await self._clasificar_con_el_llm(
            pregunta, estado["trace_id"]
        )
        return {"intencion": intencion}

    async def _clasificar_con_el_llm(self, pregunta: str, trace_id: str) -> Intencion:
        """Una única clasificación JSON con el LLM local, sin reintento; cualquier salida inválida es ``no_clasificada``."""
        prompt = armar_prompt_de_clasificacion(pregunta)
        try:
            crudo = await self._llm.completar_json(
                prompt.usuario, ESQUEMA_DE_CLASIFICACION, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_clasificacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        try:
            intencion = Intencion(_Clasificacion.model_validate_json(crudo).intent)
        except (ValidationError, ValueError):
            intencion = Intencion.no_clasificada
        if intencion not in INTENCIONES_CLASIFICABLES:
            logger.info("event=chat_clasificacion_invalida traceId=%s", trace_id)
            return Intencion.no_clasificada
        return intencion

    def nodo_de_capacidad(self, intencion: Intencion) -> Nodo:
        async def nodo(estado: EstadoDelGrafo) -> dict[str, Any]:
            return {"propuestas": await self._proponer(estado, intencion)}

        return nodo

    async def _proponer(
        self, estado: EstadoDelGrafo, intencion: Intencion
    ) -> tuple[PropuestaDelTurno, ...]:
        """El esqueleto de un nodo de capacidad: el LLM propone afirmaciones sobre los hechos; ``validar`` decide."""
        hilo = estado.get("hilo") or EstadoDelHilo()
        trace_id = estado["trace_id"]
        ventana = ventana_de_memoria(
            hilo.turnos, self._configuracion.presupuesto_de_memoria, self._contador.contar
        )
        prompt = armar_prompt_del_turno(
            hilo, estado["pregunta"], estado["hechos"], intencion, ventana
        )
        try:
            crudo = await self._llm.completar_json(
                prompt.usuario, ESQUEMA_DEL_TURNO, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_generacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        try:
            salida = _SalidaDelTurno.model_validate_json(crudo)
        except ValidationError:
            # Sin eco del texto generado: solo el hecho y su tamaño (RN-10, RN-14).
            logger.warning(
                "event=chat_salida_invalida traceId=%s caracteres=%d", trace_id, len(crudo)
            )
            raise LlmSalidaInvalidaError() from None
        return tuple(
            PropuestaDelTurno(a.texto.strip(), tuple(a.fact_refs), tuple(a.citas))
            for a in salida.afirmaciones
        )

    async def validar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        """RN-24, RN-04: solo se muestra lo que cita un hecho o un chunk de ESTE turno; el resto suma en ``omittedClaims``."""
        refs_del_turno = {h.ref for h in estado["hechos"]}
        # Los nodos de capacidad aún no recuperan chunks (US-260…US-266): ningún chunk es soporte del turno.
        chunks_del_turno: frozenset[str] = frozenset()
        bloques = tuple(
            BloqueDelTurno(BLOQUE_DOCUMENTADO, p.texto, p.fact_refs)
            for p in estado["propuestas"]
            if afirmacion_tiene_soporte_del_turno(
                p.fact_refs, p.citas, refs_del_turno, chunks_del_turno
            )
        )
        omitidas = len(estado["propuestas"]) - len(bloques)
        logger.info(
            "event=chat_validacion traceId=%s intencion=%s afirmaciones=%d mostradas=%d omittedClaims=%d",
            estado["trace_id"],
            estado["intencion"].value,
            len(estado["propuestas"]),
            len(bloques),
            omitidas,
        )
        return self._cerrar(estado, bloques, omitidas)

    async def mensaje_del_sistema(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        texto = (
            MENSAJE_FUERA_DE_ALCANCE
            if estado["intencion"] is Intencion.fuera_de_alcance
            else MENSAJE_NO_CLASIFICADA
        )
        return self._cerrar(estado, (BloqueDelTurno(BLOQUE_LIMITACION, texto),), 0)

    @staticmethod
    def _cerrar(
        estado: EstadoDelGrafo, bloques: tuple[BloqueDelTurno, ...], omitidas: int
    ) -> dict[str, Any]:
        """Guarda el turno en el estado del hilo y vacía las entradas del turno: del paciente no queda nada más."""
        hilo = estado.get("hilo") or EstadoDelHilo()
        fact_refs: list[str] = []
        for bloque in bloques:
            fact_refs += [r for r in bloque.fact_refs if r not in fact_refs]
        turno = TurnoPrevio(
            pregunta=estado["pregunta"],
            intencion=estado["intencion"].value,
            textos_de_bloques=tuple(b.texto for b in bloques),
            fact_refs=tuple(fact_refs),
        )
        return {
            "hilo": estado_tras_el_turno(hilo, turno),
            "bloques": bloques,
            "omitidas": omitidas,
            "pregunta": "",
            "hechos": (),
            "propuestas": (),
        }
