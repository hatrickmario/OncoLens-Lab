"""Grafo del turno del chat (US-259, ADR-51, design D1): ``enrutar`` → nodo de capacidad → ``validar``.

LangGraph solo orquesta el turno y su estado efímero; los nodos llaman a los puertos hexagonales (``LlmClient``,
``ContadorDeTokens``, ``ProhibitedTermsChecker``) y LangChain no sustituye a ningún adapter. ``fuera_de_alcance`` y
``no_clasificada`` son mensajes del sistema deterministas: no entran a ningún nodo de generación.

Puntos de extensión (US-260…US-266). Cada historia de capacidad sustituye UN nodo, sin tocar el resto del grafo:

- ``capacidades``: ``Mapping[Intencion, Nodo]`` con un nodo por intención clasificable (``caso``, ``faltantes``,
  ``evidencia``, ``fuentes_limitaciones``). Un nodo recibe el ``EstadoDelGrafo`` y devuelve ``{"propuestas": (...)}``.
  Lo que no se sustituye rige ``capacidades_por_defecto()``: el esqueleto, que pide al LLM afirmaciones sobre los hechos
  del caso. Toda intención clasificable tiene siempre un nodo.
- ``validar`` es el único filtro de lo que se muestra: soporte del turno (RN-24, RN-04) y lenguaje (RN-23). **No es el
  NLI**: el chequeo de soporte NLI de las afirmaciones sobre hechos (ADR-34) llega con L1D-317 (nodo ``caso``) y L1D-322
  (nodo ``evidencia``); hasta entonces una afirmación con ``factRef`` del turno y sin términos prohibidos se muestra.

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
from app.application.ports import (
    ContadorDeTokens,
    FalloDelLlm,
    LlmClient,
    ProhibitedTermsChecker,
)
from app.domain.chat.enrutado import clasificar_por_reglas, es_fuera_de_alcance
from app.domain.chat.estado import (
    ENTRADAS_DEL_TURNO_VACIAS,
    INTENCIONES_CLASIFICABLES,
    EstadoDelHilo,
    Intencion,
    estado_tras_el_turno,
)
from app.domain.chat.memoria import ventana_de_memoria
from app.domain.chat.mensajes import (
    MENSAJE_EVIDENCIA_NO_CONSULTADA,
    MENSAJE_FUERA_DE_ALCANCE,
    MENSAJE_NO_CLASIFICADA,
)
from app.domain.chat.soporte import afirmacion_tiene_soporte_del_turno
from app.domain.chat.turno import (
    BloqueDelTurno,
    HechoDelCaso,
    PropuestaDelTurno,
    TipoDeBloque,
    turno_previo_de,
)
from app.prompts.chat import armar_prompt_de_clasificacion, armar_prompt_del_turno

logger = logging.getLogger(__name__)

CAMPO_GENERADO_DEL_CHAT = "rationale"
"""Campo de ``domain.support`` con cuya política de salida generada se revisa el lenguaje de cada afirmación (RN-23)."""


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
    # Las afirmaciones que un nodo de capacidad descartó antes de entregar sus ``propuestas``; ``validar`` las suma.
    omitidas_del_nodo: int


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


def capacidades_por_defecto(
    llm: LlmClient, contador: ContadorDeTokens, configuracion: ConfiguracionDelGrafo
) -> Mapping[Intencion, Nodo]:
    """El esqueleto de cada capacidad: una entrada por intención clasificable, todas sobre el mismo LLM local."""
    esqueleto = _EsqueletoDeCapacidad(llm, contador, configuracion)
    return {intencion: esqueleto.nodo(intencion) for intencion in INTENCIONES_CLASIFICABLES}


def construir_grafo(
    *,
    llm: LlmClient,
    contador: ContadorDeTokens,
    configuracion: ConfiguracionDelGrafo,
    guardado: BaseCheckpointSaver,
    verificador_terminos: ProhibitedTermsChecker,
    capacidades: Mapping[Intencion, Nodo] | None = None,
) -> Any:
    """El ``StateGraph`` compilado con el ``InMemorySaver`` que le entrega el registro de hilos."""
    # Lo que no se sustituye sigue siendo el esqueleto: toda intención clasificable tiene siempre un nodo.
    capacidades = {**capacidades_por_defecto(llm, contador, configuracion), **(capacidades or {})}
    nodos = _NodosDelTurno(llm, configuracion, verificador_terminos)
    grafo = StateGraph(EstadoDelGrafo)
    grafo.add_node("enrutar", nodos.enrutar)
    grafo.add_node("mensaje_del_sistema", nodos.mensaje_del_sistema)
    grafo.add_node("validar", nodos.validar)
    for intencion in INTENCIONES_CLASIFICABLES:
        grafo.add_node(intencion.value, capacidades[intencion])
        grafo.add_edge(intencion.value, "validar")
    grafo.add_edge(START, "enrutar")
    grafo.add_conditional_edges("enrutar", _siguiente_nodo)
    grafo.add_edge("mensaje_del_sistema", END)
    grafo.add_edge("validar", END)
    return grafo.compile(checkpointer=guardado)


def _siguiente_nodo(estado: EstadoDelGrafo) -> str:
    intencion = estado["intencion"]
    return intencion.value if intencion in INTENCIONES_CLASIFICABLES else "mensaje_del_sistema"


class _NodosDelTurno:
    """Los nodos que no son una capacidad: enrutar, mensaje del sistema y el filtro final."""

    def __init__(
        self,
        llm: LlmClient,
        configuracion: ConfiguracionDelGrafo,
        verificador_terminos: ProhibitedTermsChecker,
    ) -> None:
        self._llm = llm
        self._configuracion = configuracion
        self._verificador_terminos = verificador_terminos

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

    async def validar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        """Filtra las afirmaciones del nodo de capacidad: solo se muestra lo que cita un hecho o un chunk de ESTE turno
        (RN-24, RN-04) y respeta el lenguaje no prescriptivo (RN-23); el resto suma en ``omittedClaims``.

        No ejecuta el NLI (ADR-34): llega con L1D-317 y L1D-322 (ver el docstring del módulo)."""
        bloques = self._bloques_permitidos(estado)
        if estado["intencion"] is Intencion.evidencia:
            # El nodo ``evidencia`` aún no consulta el corpus (L1D-322): se dice, sin eco de la pregunta.
            bloques = (
                *bloques,
                BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_EVIDENCIA_NO_CONSULTADA),
            )
        omitidas = (
            len(estado["propuestas"])
            - self._cantidad_de_afirmaciones(bloques)
            + estado.get("omitidas_del_nodo", 0)
        )
        logger.info(
            "event=chat_validacion traceId=%s intencion=%s afirmaciones=%d omittedClaims=%d",
            estado["trace_id"],
            estado["intencion"].value,
            len(estado["propuestas"]),
            omitidas,
        )
        return _cerrar(estado, bloques, omitidas)

    @staticmethod
    def _cantidad_de_afirmaciones(bloques: tuple[BloqueDelTurno, ...]) -> int:
        return sum(1 for b in bloques if b.tipo is TipoDeBloque.documentado)

    def _bloques_permitidos(self, estado: EstadoDelGrafo) -> tuple[BloqueDelTurno, ...]:
        refs_del_turno = {h.ref for h in estado["hechos"]}
        # Los nodos de capacidad aún no recuperan chunks (US-260…US-266): ningún chunk es soporte del turno.
        chunks_del_turno: frozenset[str] = frozenset()
        return tuple(
            BloqueDelTurno(TipoDeBloque.documentado, p.texto, p.fact_refs)
            for p in estado["propuestas"]
            if afirmacion_tiene_soporte_del_turno(
                p.fact_refs, p.citas, refs_del_turno, chunks_del_turno
            )
            and not self._verificador_terminos.reglas_coincidentes(
                p.texto, CAMPO_GENERADO_DEL_CHAT, ()
            )
        )

    async def mensaje_del_sistema(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        texto = (
            MENSAJE_FUERA_DE_ALCANCE
            if estado["intencion"] is Intencion.fuera_de_alcance
            else MENSAJE_NO_CLASIFICADA
        )
        return _cerrar(estado, (BloqueDelTurno(TipoDeBloque.limitacion, texto),), 0)


def _cerrar(
    estado: EstadoDelGrafo, bloques: tuple[BloqueDelTurno, ...], omitidas: int
) -> dict[str, Any]:
    """Guarda el turno en el estado del hilo y vacía las entradas del turno: del paciente no queda nada más."""
    hilo = estado.get("hilo") or EstadoDelHilo()
    turno = turno_previo_de(estado["pregunta"], estado["intencion"], bloques)
    return {
        "hilo": estado_tras_el_turno(hilo, turno),
        "bloques": bloques,
        "omitidas": omitidas,
        **ENTRADAS_DEL_TURNO_VACIAS,
    }


class _EsqueletoDeCapacidad:
    """El esqueleto de un nodo de capacidad: el LLM propone afirmaciones sobre los hechos; ``validar`` decide."""

    def __init__(
        self, llm: LlmClient, contador: ContadorDeTokens, configuracion: ConfiguracionDelGrafo
    ) -> None:
        self._llm = llm
        self._contador = contador
        self._configuracion = configuracion

    def nodo(self, intencion: Intencion) -> Nodo:
        async def nodo(estado: EstadoDelGrafo) -> dict[str, Any]:
            crudo = await self._pedir_afirmaciones_al_llm(estado, intencion)
            return {"propuestas": propuestas_de_la_salida(crudo, estado["trace_id"])}

        return nodo

    async def _pedir_afirmaciones_al_llm(self, estado: EstadoDelGrafo, intencion: Intencion) -> str:
        hilo = estado.get("hilo") or EstadoDelHilo()
        ventana = ventana_de_memoria(
            hilo.turnos, self._configuracion.presupuesto_de_memoria, self._contador.contar
        )
        prompt = armar_prompt_del_turno(
            hilo, estado["pregunta"], estado["hechos"], intencion, ventana
        )
        try:
            return await self._llm.completar_json(
                prompt.usuario, ESQUEMA_DEL_TURNO, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_generacion_llm_fallo traceId=%s", estado["trace_id"])
            raise LlmLocalNoDisponibleError() from None


def propuestas_de_la_salida(crudo: str, trace_id: str) -> tuple[PropuestaDelTurno, ...]:
    """Las afirmaciones que propone el LLM en el esquema de ``ESQUEMA_DEL_TURNO``; salida inválida → ``LLM_OUTPUT_INVALID``."""
    try:
        salida = _SalidaDelTurno.model_validate_json(crudo)
    except ValidationError:
        # Sin eco del texto generado: solo el hecho y su tamaño (RN-10, RN-14).
        logger.warning("event=chat_salida_invalida traceId=%s caracteres=%d", trace_id, len(crudo))
        raise LlmSalidaInvalidaError() from None
    return tuple(
        PropuestaDelTurno(a.texto.strip(), tuple(a.fact_refs), tuple(a.citas))
        for a in salida.afirmaciones
    )
