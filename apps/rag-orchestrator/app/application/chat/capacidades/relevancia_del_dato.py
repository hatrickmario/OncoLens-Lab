"""Subintención ``relevancia`` del nodo ``faltantes`` (US-264, ADR-51, RN-01, RN-02, RN-04, RN-23, RN-24, RN-29).

Responde «¿por qué importa este dato?» separando lo que dice el catálogo versionado (bloque ``catalogo``, determinista y
exento de cita) de lo que dice la evidencia (bloques ``evidencia``, citados y verificados con NLI). Etapas, una por método:
identificar el dato del catálogo (sin LLM; ninguno → «no es un dato crítico», sin recuperar ni generar) → recuperar con el
bucle único de reescritura (US-238) → (sin chunks sobre el umbral: solo el bloque ``catalogo`` y el aviso, sin invocar al
LLM, RN-02) → generar con ``chat-relevancia@0.1.0`` → validar citas del turno, soporte NLI y lenguaje → armar bloques.
La consulta al corpus lleva solo la etiqueta del catálogo y el tipo de cáncer: ningún dato del paciente (RN-11). Logs:
``traceId``, clave del ítem y conteos; nunca la pregunta ni el texto generado (RN-10).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.application.chat.capacidades.seguimiento_evidencia import (
    ParametrosDelSeguimiento,
    SalidaCruda,
    esquema_de_la_salida,
)
from app.application.chat.capacidades.bloques_citados import bloques_de_afirmaciones_con_soporte
from app.application.chat.citas import ConstructorDeCitas
from app.application.chat.contexto_del_turno import evidencia_del_turno
from app.application.chat.grafo import EstadoDelGrafo
from app.application.errores import LlmLocalNoDisponibleError
from app.application.generation import fragmentos_dentro_del_presupuesto, validar_salida_cruda
from app.application.medicion_de_prompt import registrar_tamano_del_prompt
from app.application.ports import (
    ContadorDeTokens,
    DatosDeRelevancia,
    FalloDelLlm,
    LlmClient,
    PosicionDeChunks,
    RecuperadorDeEvidencia,
    ResultadoDeRecuperacion,
)
from app.application.seguimiento import validar_afirmaciones_citadas
from app.domain.alias_de_chunks import asignar_alias, traducir_citas
from app.domain.chat.relevancia import (
    DatoCritico,
    TextosDelCatalogo,
    criterios_que_usan,
    identificar_dato_critico,
    texto_del_bloque_de_catalogo,
)
from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque
from app.domain.chat.ultima_evidencia import resumir_ultima_evidencia
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.relevance import top_relevance_score
from app.prompts.chat_relevancia import (
    VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT,
    armar_prompt_de_relevancia_del_chat,
)
from app.schemas.generated.models import (
    ClinicalContext,
    RagQueryInternalRequest,
    TextoEnmascarado,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TextosDeLaRelevancia:
    """Los textos fijos de configuración (RN-22) que el nodo no genera."""

    catalogo: TextosDelCatalogo
    sin_soporte: str
    fuera_del_catalogo: str
    aviso_sin_evidencia: str


@dataclass(frozen=True)
class _Explicacion:
    """Lo que la evidencia aporta a la respuesta: bloques, omisiones y avisos del turno."""

    bloques: tuple[BloqueDelTurno, ...]
    omitidas: int = 0
    avisos: tuple[str, ...] = ()


class NodoRelevancia:
    def __init__(
        self,
        *,
        datos: DatosDeRelevancia,
        servicio: RecuperadorDeEvidencia,
        posiciones: PosicionDeChunks,
        llm: LlmClient,
        contador: ContadorDeTokens,
        parametros: ParametrosDelSeguimiento,
        textos: TextosDeLaRelevancia,
    ) -> None:
        self._datos = datos
        self._servicio = servicio
        self._citas = ConstructorDeCitas(posiciones)
        self._llm = llm
        self._contador = contador
        self._parametros = parametros
        self._textos = textos
        self._esquema = esquema_de_la_salida(parametros.claims_max)

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        trace_id = estado["trace_id"]
        tipo = estado["tipo_del_contexto"]
        dato = identificar_dato_critico(
            estado["pregunta"], self._datos.datos_criticos(tipo), self._datos.sinonimos(tipo)
        )
        if dato is None:
            return self._respuesta_de_dato_fuera_del_catalogo(trace_id)
        catalogo = self._bloque_de_catalogo(dato, tipo, estado["version_del_catalogo"])
        recuperacion = await self._servicio.recuperar(
            _consulta_de(dato, tipo),
            con_reescritura=True,
            version_del_prompt=VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT,
        )
        explicacion = await self._explicar(trace_id, dato, tipo, recuperacion)
        logger.info(
            "event=chat_relevancia traceId=%s dato=%s sobreUmbral=%d bloques=%d omittedClaims=%d",
            trace_id,
            dato.clave,
            len(recuperacion.chunks_sobre_umbral),
            len(explicacion.bloques),
            explicacion.omitidas,
        )
        return {
            "propuestas": (),
            "bloques_del_nodo": (catalogo, *explicacion.bloques),
            "omitidas_del_nodo": explicacion.omitidas,
            "avisos_del_nodo": explicacion.avisos,
            "ultima_evidencia": resumir_ultima_evidencia(
                estado["pregunta"],
                recuperacion.chunk_ids_evaluados,
                top_relevance_score(recuperacion.chunks_sobre_umbral),
            ),
        }

    def _respuesta_de_dato_fuera_del_catalogo(self, trace_id: str) -> dict[str, Any]:
        """AC-5: la pregunta no nombra un dato de ``datos-criticos``; sin bloque ``catalogo``, sin recuperar ni generar."""
        logger.info("event=chat_relevancia traceId=%s dato=ninguno", trace_id)
        fuera = BloqueDelTurno(TipoDeBloque.limitacion, self._textos.fuera_del_catalogo)
        return {"propuestas": (), "bloques_del_nodo": (fuera,), "omitidas_del_nodo": 0}

    def _bloque_de_catalogo(self, dato: DatoCritico, tipo: str, version: str) -> BloqueDelTurno:
        """Lo que el catálogo vigente dice del dato: determinista, exento de cita (glosario S6 §3)."""
        criterios = criterios_que_usan(dato, self._datos.criterios(tipo))
        texto = texto_del_bloque_de_catalogo(dato, criterios, version, self._textos.catalogo)
        return BloqueDelTurno(TipoDeBloque.catalogo, texto)

    async def _explicar(
        self, trace_id: str, dato: DatoCritico, tipo: str, recuperacion: ResultadoDeRecuperacion
    ) -> _Explicacion:
        if not recuperacion.chunks_sobre_umbral:
            # RN-02: ni generación ni clasificación; el catálogo responde solo y el aviso dice que no hay evidencia.
            return _Explicacion((), avisos=(self._textos.aviso_sin_evidencia,))
        afirmaciones = await self._generar(trace_id, dato, tipo, recuperacion)
        validadas = await validar_afirmaciones_citadas(
            self._servicio, trace_id, recuperacion, afirmaciones
        )
        if not validadas.soportadas:
            sin_soporte = BloqueDelTurno(TipoDeBloque.limitacion, self._textos.sin_soporte)
            return _Explicacion((sin_soporte,), validadas.omitidas)
        bloques = await bloques_de_afirmaciones_con_soporte(
            self._citas, trace_id, validadas.soportadas, validadas.citables
        )
        return _Explicacion(bloques, validadas.omitidas)

    async def _generar(
        self, trace_id: str, dato: DatoCritico, tipo: str, recuperacion: ResultadoDeRecuperacion
    ) -> tuple[AfirmacionAtomica, ...]:
        """Prompt (etiqueta del catálogo y fragmentos con alias, sin datos del paciente) → LLM local → afirmaciones."""
        tabla = asignar_alias(
            fragmentos_dentro_del_presupuesto(
                recuperacion.chunks_sobre_umbral, self._parametros.max_chars_fragmentos
            )
        )
        prompt = armar_prompt_de_relevancia_del_chat(
            dato.etiqueta,
            tipo,
            tabla.fragmentos,
            recuperacion.meta.responseLanguage.value,
            claims_min=self._parametros.claims_min,
            claims_max=self._parametros.claims_max,
            claim_max_words=self._parametros.claim_max_words,
        )
        registrar_tamano_del_prompt(
            "relevancia",
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
            logger.warning("event=chat_relevancia_llm_fallo traceId=%s", trace_id)
            raise LlmLocalNoDisponibleError() from None
        salida = validar_salida_cruda(
            SalidaCruda, crudo, trace_id, "chat_relevancia_salida_invalida"
        )
        return tuple(
            AfirmacionAtomica(
                a.texto.strip(), PapelDeAfirmacion.principal, traducir_citas(tabla, a.citas)
            )
            for a in salida.afirmaciones
        )


def _consulta_de(dato: DatoCritico, tipo_de_cancer: str) -> RagQueryInternalRequest:
    """La consulta al corpus: la etiqueta del catálogo y el tipo de cáncer, y un contexto sin ningún dato del paciente
    (el resumen del contexto también se embebe, RN-11)."""
    base = evidencia_del_turno().consulta
    return base.model_copy(
        update={
            "query": f"{dato.etiqueta} {tipo_de_cancer}",
            "clinicalContext": _contexto_solo_con_el_tipo_de_cancer(base.clinicalContext),
        }
    )


def _contexto_solo_con_el_tipo_de_cancer(contexto: ClinicalContext) -> ClinicalContext:
    diagnostico = contexto.diagnosis
    vacio = TextoEnmascarado(root="")
    return contexto.model_copy(
        update={
            "diagnosis": None
            if diagnostico is None
            else diagnostico.model_copy(
                update={
                    "histology": None,
                    "grade": None,
                    "stagingSystem": vacio,
                    "stageValue": vacio,
                    "performanceScale": None,
                    "performanceValue": None,
                    "monthsSinceDiagnosis": 0,
                }
            ),
            "biomarkers": [],
            "clinicalNotes": [],
            "currentLine": None,
            "attributes": [],
            "priorTreatments": [],
            "events": [],
            "biomarkerTrends": [],
            "missingCriticalData": [],
            "priorAnalyses": [],
        }
    )
