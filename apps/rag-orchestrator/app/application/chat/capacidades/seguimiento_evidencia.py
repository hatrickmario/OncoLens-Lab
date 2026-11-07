"""Nodo de seguimiento de un análisis dentro del chat (US-265, ADR-51 §5, RN-01, RN-02, RN-04, RN-24).

Responde una pregunta sobre el resultado de un análisis ya registrado SIN crear otro: vuelve a recuperar (una vez, sin el
segundo loop de reescritura, para que la memoria no llegue al prompt de reescritura) y cita solo lo recuperado en ESTE turno.
Etapas, una por método: recuperar → (sin chunks sobre el umbral: «sin evidencia» sin invocar al LLM, RN-02) → generar con
el prompt de seguimiento → validar citas, soporte NLI y lenguaje → armar bloques con citas del corpus. La respuesta del
turno anterior entra al prompt solo como memoria no citable (``PromptBuilder.memoria()``) y nunca sostiene una afirmación.
Logs: solo conteos y ``traceId``, jamás la pregunta, la memoria ni el texto de una afirmación (RN-10).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.application.chat.capacidades.bloques_citados import bloques_de_afirmaciones_con_soporte
from app.application.chat.citas import ConstructorDeCitas
from app.application.chat.contexto_del_turno import evidencia_del_turno
from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo
from app.application.errores import LlmLocalNoDisponibleError
from app.application.generation import fragmentos_dentro_del_presupuesto, validar_salida_cruda
from app.application.ports import (
    ContadorDeTokens,
    FalloDelLlm,
    LlmClient,
    PosicionDeChunks,
    RecuperadorDeEvidencia,
    ResultadoDeRecuperacion,
)
from app.application.medicion_de_prompt import registrar_tamano_del_prompt
from app.application.rag_orchestrator_service import LIMITACION_SIN_EVIDENCIA
from app.application.seguimiento import validar_afirmaciones_citadas
from app.domain.alias_de_chunks import PATRON_DE_ALIAS, asignar_alias, traducir_citas
from app.domain.chat.estado import EstadoDelHilo
from app.domain.chat.mensajes import MENSAJE_SEGUIMIENTO_SIN_AFIRMACIONES
from app.domain.chat.memoria import texto_de_turno, ventana_de_memoria
from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque
from app.domain.chat.ultima_evidencia import resumir_ultima_evidencia
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.relevance import top_relevance_score
from app.prompts.chat_seguimiento_evidencia import (
    VERSION_DEL_PROMPT_DE_SEGUIMIENTO_DEL_CHAT,
    armar_prompt_de_seguimiento_del_chat,
)
from app.prompts.rag_query import bloque_de_datos_del_paciente

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ParametrosDelSeguimiento:
    """Valores de configuración de la generación (RN-22), los mismos que usa el análisis."""

    claims_min: int
    claims_max: int
    claim_max_words: int
    max_chars_fragmentos: int
    num_ctx: int = 0
    """``LLM_NUM_CTX``: solo para medir el tamaño del prompt (no cambia ningún comportamiento)."""


class AfirmacionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text", min_length=1)
    citas: list[str] = Field(alias="citations")


class SalidaCruda(BaseModel):
    """Esquema interno de la salida del LLM del seguimiento (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    afirmaciones: list[AfirmacionCruda] = Field(alias="claims")


def esquema_de_la_salida(claims_max: int) -> dict[str, Any]:
    """Esquema entregado al LLM: hasta ``claims_max`` afirmaciones y alias con el formato de la consulta."""
    esquema = SalidaCruda.model_json_schema()
    esquema["properties"]["claims"]["maxItems"] = claims_max
    esquema["$defs"]["AfirmacionCruda"]["properties"]["citations"]["items"] = {
        "type": "string",
        "pattern": PATRON_DE_ALIAS,
    }
    return esquema


class NodoSeguimientoDeEvidencia:
    def __init__(
        self,
        *,
        servicio: RecuperadorDeEvidencia,
        posiciones: PosicionDeChunks,
        llm: LlmClient,
        contador: ContadorDeTokens,
        configuracion: ConfiguracionDelGrafo,
        parametros: ParametrosDelSeguimiento,
    ) -> None:
        self._servicio = servicio
        self._citas = ConstructorDeCitas(posiciones)
        self._llm = llm
        self._contador = contador
        self._configuracion = configuracion
        self._parametros = parametros
        self._esquema = esquema_de_la_salida(parametros.claims_max)

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        trace_id = estado["trace_id"]
        recuperacion = await self._servicio.recuperar(
            evidencia_del_turno().consulta,
            con_reescritura=False,
            version_del_prompt=VERSION_DEL_PROMPT_DE_SEGUIMIENTO_DEL_CHAT,
        )
        bloques, omitidas = await self._responder(estado, recuperacion)
        logger.info(
            "event=chat_seguimiento_evidencia traceId=%s sobreUmbral=%d bloques=%d omittedClaims=%d",
            trace_id,
            len(recuperacion.chunks_sobre_umbral),
            len(bloques),
            omitidas,
        )
        return {
            "propuestas": (),
            "bloques_del_nodo": bloques,
            "omitidas_del_nodo": omitidas,
            "evidencia_consultada": True,
            "ultima_evidencia": resumir_ultima_evidencia(
                estado["pregunta"],
                recuperacion.chunk_ids_evaluados,
                top_relevance_score(recuperacion.chunks_sobre_umbral),
            ),
        }

    async def _responder(
        self, estado: EstadoDelGrafo, recuperacion: ResultadoDeRecuperacion
    ) -> tuple[tuple[BloqueDelTurno, ...], int]:
        if not recuperacion.chunks_sobre_umbral:
            # RN-02: ni generación, ni reescritura, ni clasificación; el texto es el de «sin evidencia» de /rag/query.
            return (BloqueDelTurno(TipoDeBloque.limitacion, LIMITACION_SIN_EVIDENCIA),), 0
        afirmaciones = await self._generar(estado, recuperacion)
        return await self._validar(estado["trace_id"], recuperacion, afirmaciones)

    async def _generar(
        self, estado: EstadoDelGrafo, recuperacion: ResultadoDeRecuperacion
    ) -> tuple[AfirmacionAtomica, ...]:
        """Prompt (pregunta, memoria no citable, datos del paciente y fragmentos con alias) → LLM local → afirmaciones."""
        trace_id = estado["trace_id"]
        tabla = asignar_alias(
            fragmentos_dentro_del_presupuesto(
                recuperacion.chunks_sobre_umbral, self._parametros.max_chars_fragmentos
            )
        )
        hilo = estado.get("hilo") or EstadoDelHilo()
        ventana = ventana_de_memoria(
            hilo.turnos, self._configuracion.presupuesto_de_memoria, self._contador.contar
        )
        prompt = armar_prompt_de_seguimiento_del_chat(
            estado["pregunta"],
            tabla.fragmentos,
            "\n".join(texto_de_turno(t) for t in ventana),
            bloque_de_datos_del_paciente(evidencia_del_turno().consulta.clinicalContext),
            recuperacion.meta.responseLanguage.value,
            claims_min=self._parametros.claims_min,
            claims_max=self._parametros.claims_max,
            claim_max_words=self._parametros.claim_max_words,
        )
        registrar_tamano_del_prompt(
            "seguimiento",
            trace_id,
            prompt,
            len(tabla.fragmentos),
            self._contador,
            self._parametros.num_ctx,
        )
        try:
            crudo = await self._llm.completar_json(
                prompt.usuario, self._esquema, sistema=prompt.sistema
            )
        except FalloDelLlm:
            logger.warning("event=chat_seguimiento_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = validar_salida_cruda(
            SalidaCruda, crudo, trace_id, "chat_seguimiento_salida_invalida"
        )
        return tuple(
            AfirmacionAtomica(
                a.texto.strip(), PapelDeAfirmacion.principal, traducir_citas(tabla, a.citas)
            )
            for a in salida.afirmaciones
        )

    async def _validar(
        self,
        trace_id: str,
        recuperacion: ResultadoDeRecuperacion,
        afirmaciones: tuple[AfirmacionAtomica, ...],
    ) -> tuple[tuple[BloqueDelTurno, ...], int]:
        """RN-01, RN-04, RN-23, RN-24: solo se muestra lo que cita un chunk de ESTE turno, lo implica el NLI frente a esos
        chunks y respeta el lenguaje; el resto se omite y suma en ``omittedClaims``."""
        validadas = await validar_afirmaciones_citadas(
            self._servicio, trace_id, recuperacion, afirmaciones
        )
        omitidas = validadas.omitidas
        if not validadas.soportadas:
            return (
                BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_SEGUIMIENTO_SIN_AFIRMACIONES),
            ), omitidas
        return await bloques_de_afirmaciones_con_soporte(
            self._citas, trace_id, validadas.soportadas, validadas.citables
        ), omitidas
