"""Grafo del turno del chat (US-259, ADR-51, design D1): ``enrutar`` → nodo de capacidad → ``validar``.

LangGraph solo orquesta el turno y su estado efímero; los nodos llaman a los puertos hexagonales (``LlmClient``,
``ContadorDeTokens``, ``ProhibitedTermsChecker``) y LangChain no sustituye a ningún adapter. ``fuera_de_alcance`` y
``no_clasificada`` son mensajes del sistema deterministas: no entran a ningún nodo de generación.

Puntos de extensión (US-260…US-266). Cada historia de capacidad sustituye UN nodo, sin tocar el resto del grafo:

- ``capacidades``: ``Mapping[Intencion, Nodo]`` con un nodo por intención clasificable (``caso``, ``faltantes``,
  ``evidencia``, ``fuentes_limitaciones``). Un nodo recibe el ``EstadoDelGrafo`` y devuelve ``{"propuestas": (...)}``.
  Lo que no se sustituye rige ``capacidades_por_defecto()``: el esqueleto, que pide al LLM afirmaciones sobre los hechos
  del caso. Toda intención clasificable tiene siempre un nodo.
- ``validar`` es el único filtro final de lo que se muestra: soporte del turno (RN-24, RN-04) y lenguaje (RN-23). **No es
  el NLI**: el chequeo de soporte NLI de las afirmaciones sobre hechos (ADR-34) lo hace cada nodo de capacidad que lo
  necesita (``caso``, L1D-317; ``evidencia``, L1D-322) y descarta lo no soportado en ``omitidas_del_nodo``; un nodo que
  aún es el esqueleto entrega afirmaciones sin NLI y ``validar`` solo exige un ``factRef`` del turno y lenguaje no prescriptivo.
- ``pedir_afirmaciones`` es la etapa de generación común (memoria → prompt → LLM local → afirmaciones) que usan el esqueleto
  y los nodos reales; cada nodo solo aporta su ``armar_prompt``.

El estado del hilo (``hilo``) es lo único que sobrevive entre turnos; los campos del turno (pregunta, hechos) se vacían al
cerrar. Nunca hay ``patientId`` ni ``pseudoPatientId`` en el estado (RN-10, RN-11).
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import replace
from typing import Any, Literal, NamedTuple, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.application.errores import LlmLocalNoDisponibleError, LlmSalidaInvalidaError
from app.application.ports import (
    ContadorDeTokens,
    FalloDelLlm,
    LlmClient,
    ProhibitedTermsChecker,
)
from app.application.prompt_builder import PromptSeparado
from app.domain.chat.enrutado import (
    clasificar_por_reglas,
    es_fuera_de_alcance,
    es_seguimiento_de_evidencia,
)
from app.domain.chat.estado import (
    ENTRADAS_DEL_TURNO_VACIAS,
    INTENCIONES_CLASIFICABLES,
    EstadoDelHilo,
    Intencion,
    LimitacionesDelAnalisis,
    Subintencion,
    TurnoPrevio,
    UltimaEvidencia,
    estado_tras_el_turno,
)
from app.domain.chat.faltantes import ItemDeCompletitud
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
    completitud: tuple[ItemDeCompletitud, ...]
    version_del_catalogo: str
    tipo_del_contexto: str
    clasificacion_de_datos: str
    trace_id: str
    # Solo si hay un análisis activo en la conversación; el id nunca entra al grafo (lo conoce solo Backend 1).
    hay_analisis_activo: bool
    # Lo único que sobrevive entre turnos, junto con el resultado del último.
    hilo: EstadoDelHilo
    intencion: Intencion
    subintencion: Subintencion | None
    propuestas: tuple[PropuestaDelTurno, ...]
    bloques_deterministas: tuple[BloqueDelTurno, ...]
    bloques: tuple[BloqueDelTurno, ...]
    omitidas: int
    # Lo que un nodo de capacidad que ya valida por sí mismo entrega a ``validar`` (se vacía al cerrar).
    bloques_del_nodo: tuple[BloqueDelTurno, ...]
    omitidas_del_nodo: int
    # Del nodo de capacidad a ``validar`` y a la respuesta: el texto de limitación que prefiere si no queda ningún bloque y
    # los avisos no bloqueantes del turno (texto fijo de configuración, sin datos del paciente).
    limitacion_del_nodo: str
    avisos_del_nodo: tuple[str, ...]
    avisos: tuple[str, ...]
    ultima_evidencia: UltimaEvidencia | None
    limitaciones_del_analisis: LimitacionesDelAnalisis | None
    opciones_mostradas: tuple[str, ...]
    evidencia_consultada: bool


class _Clasificacion(BaseModel):
    """Esquema interno de la clasificación con el LLM (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    intent: str


class _AfirmacionCruda(BaseModel):
    """Una afirmación del LLM. ``kind`` (``documentado`` | ``interpretacion``) lo eligen los nodos que lo piden; un
    ``documentado`` solo elige ``factRefs`` y su ``text`` puede ir vacío (lo escribe el código, US-261)."""

    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text")
    kind: Literal["documentado", "interpretacion"] | None = None
    fact_refs: list[str] = Field(alias="factRefs")
    citas: list[str] = Field(alias="citations")

    @model_validator(mode="after")
    def _el_texto_solo_puede_ir_vacio_si_es_documentado(self) -> _AfirmacionCruda:
        if not self.texto.strip() and self.kind != "documentado":
            raise ValueError("text vacío sin kind documentado")
        return self


class _SalidaDelTurno(BaseModel):
    """Esquema interno de la generación de un nodo de capacidad (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    afirmaciones: list[_AfirmacionCruda] = Field(alias="claims")


ESQUEMA_DE_CLASIFICACION: dict[str, Any] = _Clasificacion.model_json_schema()
ESQUEMA_DE_CLASIFICACION["properties"]["intent"]["enum"] = [
    *(i.value for i in INTENCIONES_CLASIFICABLES),
    Subintencion.seguimiento_evidencia.value,
]
ESQUEMA_DEL_TURNO: dict[str, Any] = _SalidaDelTurno.model_json_schema()

Nodo = Callable[[EstadoDelGrafo], Awaitable[dict[str, Any]]]


class ConfiguracionDelGrafo(NamedTuple):
    presupuesto_de_memoria: int
    terminos_por_tipo: Mapping[str, frozenset[str]]
    limitacion_cuando_vacio: Mapping[Intencion, str]
    """Por intención, el texto fijo del bloque ``limitacion`` que ``validar`` añade cuando no queda ningún bloque (RN-01,
    RN-22): que no hay datos documentados. ``evidencia`` no está: su nodo real dice lo suyo (L1D-322) y, sin él, ``validar``
    añade «evidencia no consultada»."""


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
    subcapacidades: Mapping[Subintencion, Nodo] | None = None,
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
    # Un nodo por subintención: la subintención refina una intención y tiene su propia capacidad (L1D-322).
    nodos_de_subintencion = dict(subcapacidades or {})
    for subintencion, nodo in nodos_de_subintencion.items():
        grafo.add_node(subintencion.value, nodo)
        grafo.add_edge(subintencion.value, "validar")
    grafo.add_edge(START, "enrutar")
    grafo.add_conditional_edges("enrutar", _selector_de_nodo(nodos_de_subintencion))
    grafo.add_edge("mensaje_del_sistema", END)
    grafo.add_edge("validar", END)
    return grafo.compile(checkpointer=guardado)


def _evidencia_de_seguimiento() -> dict[str, Any]:
    return {"intencion": Intencion.evidencia, "subintencion": Subintencion.seguimiento_evidencia}


def _evidencia_nueva() -> dict[str, Any]:
    return {"intencion": Intencion.evidencia, "subintencion": None}


def _selector_de_nodo(
    subcapacidades: Mapping[Subintencion, Nodo],
) -> Callable[[EstadoDelGrafo], str]:
    """Catálogo de nodos por (intención, subintención): una subintención sin nodo registrado falla en voz alta, nunca cae
    en silencio al nodo de la intención."""

    def siguiente(estado: EstadoDelGrafo) -> str:
        intencion = estado["intencion"]
        if intencion not in INTENCIONES_CLASIFICABLES:
            return "mensaje_del_sistema"
        subintencion = estado.get("subintencion")
        if subintencion is None:
            return intencion.value
        if subintencion not in subcapacidades:
            raise ValueError(f"subintención sin nodo registrado: {subintencion}")
        return subintencion.value

    return siguiente


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
        self._terminos_del_catalogo = frozenset().union(*configuracion.terminos_por_tipo.values())

    async def enrutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        pregunta = estado["pregunta"]
        if es_fuera_de_alcance(
            pregunta, estado["tipo_del_contexto"], self._configuracion.terminos_por_tipo
        ):
            return {"intencion": Intencion.fuera_de_alcance, "subintencion": None}
        hay_analisis = estado.get("hay_analisis_activo", False)
        por_reglas = clasificar_por_reglas(pregunta, self._terminos_del_catalogo)
        if por_reglas in (None, Intencion.evidencia) and es_seguimiento_de_evidencia(
            pregunta, hay_analisis
        ):
            return _evidencia_de_seguimiento()
        if por_reglas is not None:
            return {"intencion": por_reglas, "subintencion": None}
        return await self._clasificar_con_el_llm(pregunta, estado["trace_id"], hay_analisis)

    async def _clasificar_con_el_llm(
        self, pregunta: str, trace_id: str, hay_analisis_activo: bool
    ) -> dict[str, Any]:
        """Una única clasificación JSON con el LLM local, sin reintento; cualquier salida inválida es ``no_clasificada``.

        ``seguimiento_evidencia`` solo cuenta con un análisis activo; sin él, es una pregunta de evidencia nueva."""
        prompt = armar_prompt_de_clasificacion(pregunta, con_analisis_activo=hay_analisis_activo)
        try:
            crudo = await self._llm.completar_json(
                prompt.usuario, ESQUEMA_DE_CLASIFICACION, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_clasificacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        try:
            dicha = _Clasificacion.model_validate_json(crudo).intent
            if dicha == Subintencion.seguimiento_evidencia.value:
                return _evidencia_de_seguimiento() if hay_analisis_activo else _evidencia_nueva()
            intencion = Intencion(dicha)
        except (ValidationError, ValueError):
            intencion = Intencion.no_clasificada
        if intencion not in INTENCIONES_CLASIFICABLES:
            logger.info("event=chat_clasificacion_invalida traceId=%s", trace_id)
            return {"intencion": Intencion.no_clasificada, "subintencion": None}
        return {"intencion": intencion, "subintencion": None}

    async def validar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        """Filtra las afirmaciones del nodo de capacidad: solo se muestra lo que cita un hecho o un chunk de ESTE turno
        (RN-24, RN-04) y respeta el lenguaje no prescriptivo (RN-23); el resto suma en ``omittedClaims``.

        No ejecuta el NLI (ADR-34): lo ejecuta cada nodo de capacidad que lo necesita (``caso`` desde L1D-317;
        ``evidencia`` con L1D-322) antes de entregar sus ``propuestas``; ver el docstring del módulo."""
        # Los bloques deterministas (catálogo, configuración) no pasan por el filtro de soporte: están exentos de cita.
        bloques = (
            *estado.get("bloques_deterministas", ()),
            *estado.get("bloques_del_nodo", ()),
            *self._bloques_permitidos(estado),
        )
        bloques = (*bloques, *self._limitaciones_del_turno(estado, bloques))
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

    def _limitaciones_del_turno(
        self, estado: EstadoDelGrafo, bloques: tuple[BloqueDelTurno, ...]
    ) -> tuple[BloqueDelTurno, ...]:
        """Los bloques ``limitacion`` que el turno debe decir: sin el nodo real de evidencia (sin corpus detrás) no se
        consultó la evidencia y se dice, sin eco de la pregunta; si no quedó ningún bloque, el que prefirió el nodo de
        capacidad o el fijo de ``limitacion_cuando_vacio`` (US-261 AC-4, RN-01): el turno dice que no hay datos, no calla."""
        intencion = estado["intencion"]
        if intencion is Intencion.evidencia and not estado.get("evidencia_consultada"):
            return (BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_EVIDENCIA_NO_CONSULTADA),)
        texto = estado.get(
            "limitacion_del_nodo"
        ) or self._configuracion.limitacion_cuando_vacio.get(intencion)
        return (BloqueDelTurno(TipoDeBloque.limitacion, texto),) if texto and not bloques else ()

    @staticmethod
    def _cantidad_de_afirmaciones(bloques: tuple[BloqueDelTurno, ...]) -> int:
        return sum(
            1 for b in bloques if b.tipo in (TipoDeBloque.documentado, TipoDeBloque.interpretacion)
        )

    def _bloques_permitidos(self, estado: EstadoDelGrafo) -> tuple[BloqueDelTurno, ...]:
        refs_del_turno = {h.ref for h in estado["hechos"]}
        # Los nodos de capacidad aún no recuperan chunks (US-260…US-266): ningún chunk es soporte del turno.
        chunks_del_turno: frozenset[str] = frozenset()
        return tuple(
            BloqueDelTurno(p.tipo or TipoDeBloque.documentado, p.texto, p.fact_refs)
            for p in estado["propuestas"]
            if p.texto
            and afirmacion_tiene_soporte_del_turno(
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
    citas = tuple(c.chunk_id for b in bloques for c in b.citas)
    return {
        "hilo": estado_tras_el_turno(
            hilo,
            turno,
            ultima_evidencia=estado.get("ultima_evidencia"),
            limitaciones_del_analisis=estado.get("limitaciones_del_analisis"),
            opciones_mostradas=estado.get("opciones_mostradas", ()),
            citas_mostradas=citas,
        ),
        "bloques": bloques,
        "omitidas": omitidas,
        "avisos": estado.get("avisos_del_nodo", ()),
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
            def armar(hilo: EstadoDelHilo, ventana: Sequence[TurnoPrevio]) -> PromptSeparado:
                return armar_prompt_del_turno(
                    hilo, estado["pregunta"], estado["hechos"], intencion, ventana
                )

            propuestas = await pedir_afirmaciones(
                self._llm, self._contador, self._configuracion, estado, armar
            )
            # Solo el nodo ``caso`` verifica y rotula una interpretación: el esqueleto entrega siempre ``documentado``.
            return {
                "propuestas": tuple(replace(p, tipo=TipoDeBloque.documentado) for p in propuestas)
            }

        return nodo


async def pedir_afirmaciones(
    llm: LlmClient,
    contador: ContadorDeTokens,
    configuracion: ConfiguracionDelGrafo,
    estado: EstadoDelGrafo,
    armar_prompt: Callable[[EstadoDelHilo, Sequence[TurnoPrevio]], PromptSeparado],
) -> tuple[PropuestaDelTurno, ...]:
    """Etapa común de generación de un nodo de capacidad: ventana de memoria → prompt → LLM local → afirmaciones.

    Un fallo del LLM es ``LOCAL_LLM_UNAVAILABLE`` y una salida que no cumple el esquema, ``LLM_OUTPUT_INVALID``."""
    hilo = estado.get("hilo") or EstadoDelHilo()
    ventana = ventana_de_memoria(hilo.turnos, configuracion.presupuesto_de_memoria, contador.contar)
    prompt = armar_prompt(hilo, ventana)
    try:
        crudo = await llm.completar_json(prompt.usuario, ESQUEMA_DEL_TURNO, sistema=prompt.sistema)
    except FalloDelLlm:
        logger.warning("event=chat_generacion_llm_fallo traceId=%s", estado["trace_id"])
        raise LlmLocalNoDisponibleError() from None
    return propuestas_de_la_salida(crudo, estado["trace_id"])


def propuestas_de_la_salida(crudo: str, trace_id: str) -> tuple[PropuestaDelTurno, ...]:
    """Las afirmaciones que propone el LLM en el esquema de ``ESQUEMA_DEL_TURNO``; salida inválida → ``LLM_OUTPUT_INVALID``."""
    try:
        salida = _SalidaDelTurno.model_validate_json(crudo)
    except ValidationError:
        # Sin eco del texto generado: solo el hecho y su tamaño (RN-10, RN-14).
        logger.warning("event=chat_salida_invalida traceId=%s caracteres=%d", trace_id, len(crudo))
        raise LlmSalidaInvalidaError() from None
    return tuple(
        PropuestaDelTurno(
            a.texto.strip(),
            tuple(a.fact_refs),
            tuple(a.citas),
            None if a.kind is None else TipoDeBloque(a.kind),
        )
        for a in salida.afirmaciones
    )
