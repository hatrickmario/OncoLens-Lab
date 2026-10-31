"""Generación de la rama con evidencia de `/rag/query` (US-225, US-245): prompt → LLM local → opciones crudas.

El LLM solo aporta por opción su nombre y de 1 a N afirmaciones atómicas ``{text, role, citations}``, con los alias de chunk
traducidos a ``chunkId`` reales (RN-04); la atribución («La fuente reporta que…») la compone el código (ADR-34). Todo campo
de más (títulos, fuentes, puntajes) se descarta al parsear. Una salida que no es JSON o no valida el esquema interno (p. ej.
dos ``principal``) es ``LlmSalidaInvalidaError`` (`503 LLM_OUTPUT_INVALID`); un LLM que no responde es
``LlmLocalNoDisponibleError`` (`503 LOCAL_LLM_UNAVAILABLE`). Sin reintento silencioso ni respuesta parcial.
"""

from __future__ import annotations

import copy
import logging
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic_core import PydanticCustomError

from app.application.errores import LlmLocalNoDisponibleError, LlmSalidaInvalidaError
from app.application.ports import (
    EvidenciaGenerada,
    FalloDelLlm,
    LlmClient,
    ResultadoDeRecuperacion,
)
from app.domain.alias_de_chunks import (
    CITA_NO_TRADUCIBLE,
    PATRON_DE_ALIAS,
    TablaDeAlias,
    asignar_alias,
    traducir_citas,
)
from app.domain.atribucion import componer_con_marco
from app.domain.citations import OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import bloque_de_datos_del_paciente, construir_prompt_rag_query
from app.schemas.generated.models import RagQueryInternalRequest

logger = logging.getLogger(__name__)


class _AfirmacionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text", min_length=1)
    papel: PapelDeAfirmacion = Field(alias="role")
    citas: list[str] = Field(alias="citations")


class _OpcionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    option: str = Field(min_length=1)
    afirmaciones: list[_AfirmacionCruda] = Field(alias="claims", min_length=1)

    @model_validator(mode="after")
    def _exactamente_una_principal(self) -> _OpcionCruda:
        principales = sum(a.papel is PapelDeAfirmacion.principal for a in self.afirmaciones)
        if principales == 0:
            raise PydanticCustomError("principal_ausente", "falta la afirmación principal")
        if principales > 1:
            raise PydanticCustomError("principal_duplicada", "hay más de una afirmación principal")
        return self


class GenerationOutput(BaseModel):
    """Esquema interno de la salida del LLM (no es contrato entre servicios). Sin ``limitations`` `[S1 resp. 11]`."""

    model_config = ConfigDict(extra="ignore")

    options: list[_OpcionCruda]


ESQUEMA_DE_GENERACION: dict[str, Any] = GenerationOutput.model_json_schema()


def esquema_de_generacion(claims_min: int, claims_max: int) -> dict[str, Any]:
    """Esquema entregado al LLM (salida estructurada): de ``claims_min`` a ``claims_max`` afirmaciones por opción (RN-22)
    y, en ``citations``, solo alias con el formato de la consulta."""
    esquema = copy.deepcopy(ESQUEMA_DE_GENERACION)
    opcion = esquema["$defs"]["_OpcionCruda"]
    opcion["properties"]["claims"]["minItems"] = claims_min
    opcion["properties"]["claims"]["maxItems"] = claims_max
    # Solo en el esquema entregado al runtime (gramática): el parseo no lo valida, un token fuera de patrón es
    # ``cita_invalida`` y no un 503 (US-236, design D4).
    afirmacion = esquema["$defs"]["_AfirmacionCruda"]
    afirmacion["properties"]["citations"]["items"]["pattern"] = PATRON_DE_ALIAS
    return esquema


def _tipos_de_error(error: ValidationError | PydanticCustomError) -> list[str]:
    """Solo el tipo de cada error de validación (p. ej. ``principal_duplicada``), nunca el contenido generado."""
    if isinstance(error, ValidationError):
        return sorted({e["type"] for e in error.errors()})
    return [error.type]


class LlmEvidenceGenerator:
    """Implementa ``EvidenceGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(
        self,
        cliente: LlmClient,
        claims_min: int,
        claims_max: int,
        claim_max_words: int,
        max_chars_fragmentos: int = 12000,
    ) -> None:
        self._cliente = cliente
        self._claims_min = claims_min
        self._claims_max = claims_max
        self._claim_max_words = claim_max_words
        self._max_chars_fragmentos = max_chars_fragmentos
        self._esquema = esquema_de_generacion(claims_min, claims_max)

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        trace_id = solicitud.traceId.root
        idioma = recuperacion.meta.responseLanguage
        tabla = asignar_alias(
            self._fragmentos_dentro_del_presupuesto(recuperacion.chunks_sobre_umbral)
        )
        prompt = construir_prompt_rag_query(
            solicitud.query,
            bloque_de_datos_del_paciente(solicitud.clinicalContext),
            tabla.fragmentos,
            idioma,
            self._claims_min,
            self._claims_max,
            self._claim_max_words,
        )
        try:
            crudo = await self._cliente.completar_json(prompt, self._esquema)
        except FalloDelLlm:
            logger.warning("event=generacion_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = self._parsear(crudo, trace_id)
        opciones = tuple(self._opcion_generada(o, tabla, idioma.value) for o in salida.options)
        no_traducibles = sum(c == CITA_NO_TRADUCIBLE for o in opciones for c in o.chunk_ids_citados)
        # Solo conteos: nunca un alias, un chunkId ni texto de un chunk (RN-14, RN-06).
        logger.info(
            "event=rag_query_generacion traceId=%s opcionesGeneradas=%d afirmaciones=%d "
            "citasTraducidas=%d citasNoTraducibles=%d",
            trace_id,
            len(opciones),
            sum(len(o.afirmaciones) for o in opciones),
            sum(len(o.chunk_ids_citados) for o in opciones) - no_traducibles,
            no_traducibles,
        )
        return EvidenciaGenerada(
            opciones=opciones,
            limitaciones_propuestas=(),  # el LLM no genera limitaciones en el S1 [S1 resp. 11]
        )

    @staticmethod
    def _opcion_generada(cruda: _OpcionCruda, tabla: TablaDeAlias, idioma: str) -> OpcionGenerada:
        """La opción con sus alias ya traducidos a ``chunkId`` reales: ``validar_citas`` nunca ve un alias (RN-04).

        ``rationale`` y ``details`` salen compuestos con el marco de atribución; las citas de la opción son la unión de las
        de sus afirmaciones, y cada afirmación conserva las suyas para el NLI.
        """
        afirmaciones = tuple(
            AfirmacionAtomica(a.texto.strip(), a.papel, traducir_citas(tabla, a.citas))
            for a in cruda.afirmaciones
        )
        composicion = componer_con_marco(afirmaciones, idioma)
        citados = tuple(dict.fromkeys(c for a in afirmaciones for c in a.chunk_ids))
        return OpcionGenerada(
            cruda.option, composicion.rationale, citados, composicion.details, afirmaciones
        )

    def _fragmentos_dentro_del_presupuesto(
        self, chunks: Sequence[ChunkPuntuado]
    ) -> list[ChunkPuntuado]:
        """Los más relevantes que caben en ``max_chars_fragmentos`` (el primero siempre entra).

        La ventana de contexto del runtime se reparte entre el prompt y la salida: con demasiados fragmentos la salida se
        trunca y el JSON queda inválido (503). Los chunks llegan ordenados por relevancia (RN-22).
        """
        elegidos: list[ChunkPuntuado] = []
        total = 0
        for chunk in chunks:
            if elegidos and total + len(chunk.chunk_text) > self._max_chars_fragmentos:
                break
            elegidos.append(chunk)
            total += len(chunk.chunk_text)
        return elegidos

    def _parsear(self, crudo: str, trace_id: str) -> GenerationOutput:
        """JSON inválido o fuera de esquema = salida del LLM no validada; solo se registra el tipo de cada error."""
        try:
            salida = GenerationOutput.model_validate_json(crudo)
            self._exigir_cantidad_de_afirmaciones(salida)
        except (ValidationError, PydanticCustomError) as error:
            tipos = _tipos_de_error(error)
            # Solo el tipo de cada error y la longitud: nunca el contenido generado a partir del corpus (RN-14).
            logger.warning(
                "event=generacion_salida_invalida traceId=%s caracteres=%d errores=%s",
                trace_id,
                len(crudo),
                ",".join(tipos),
            )
            raise LlmSalidaInvalidaError() from None
        return salida

    def _exigir_cantidad_de_afirmaciones(self, salida: GenerationOutput) -> None:
        for opcion in salida.options:
            if not self._claims_min <= len(opcion.afirmaciones) <= self._claims_max:
                raise PydanticCustomError(
                    "afirmaciones_fuera_de_rango", "cantidad de afirmaciones fuera de rango"
                )
