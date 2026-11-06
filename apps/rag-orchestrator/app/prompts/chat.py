"""Prompts del turno del chat `chat-turn@0.1.0` (US-259, US-057): funciones puras, sin E/S.

Las instrucciones van en el mensaje de sistema y todo dato (pregunta, hechos del caso, memoria) en un bloque delimitado del
de usuario, armados con ``PromptBuilder``; la memoria solo entra por ``PromptBuilder.memoria()`` (bloque
``<memory citable="no">``, RN-24), nunca con rótulos propios. El prompt es una función pura del estado del hilo: el mismo
estado produce el mismo texto (orden estable y sin marcas de tiempo absolutas), así un hilo reconstruido desde
``rehydration`` envía lo mismo que el hilo vivo. Solo recibe texto ya enmascarado: nunca el ``pseudoPatientId`` (RN-11).
Redactado en positivo y sin términos de RN-23 (un test lo verifica con ``check_prohibited_terms``).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.prompt_builder import (
    PromptBuilder,
    PromptSeparado,
    linea_de_datos_no_instrucciones,
)
from app.domain.chat.estado import EstadoDelHilo, Intencion, TurnoPrevio
from app.domain.chat.memoria import texto_de_turno
from app.domain.chat.turno import HechoDelCaso

VERSION_DEL_PROMPT_DE_CHAT = "chat-turn@0.1.0"

ROTULO_DE_LA_MEMORIA = "Conversación previa (no es evidencia; no la cites)"
SIN_DATOS = "No disponible"

PLANTILLA_DEL_TURNO = """\
Eres un asistente que responde preguntas de un oncólogo sobre el caso de un paciente.
Describe únicamente lo que reportan los datos del paciente, entregados en <patient_data> con una referencia por dato (f1, f2…); el conocimiento externo queda fuera de la respuesta.

Instrucciones:
- La intención de la pregunta es "{intencion}".
- Devuelve en "claims" afirmaciones declarativas breves que describen los datos del paciente.
- Indica en "factRefs" de cada afirmación las referencias de los datos que la sustentan; usa solo las referencias entregadas, escritas exactamente como aparecen.
- Deja "citations" vacío: en esta etapa no se entregan fragmentos de evidencia.
- El bloque <memory> ({rotulo_de_la_memoria}) solo sitúa la pregunta: no es evidencia, no se cita y no sustenta ninguna afirmación.
- {linea_de_datos}
- La pregunta va en <question>.
- Redacta en español.
- Entrega únicamente el JSON conforme al esquema.
"""

PLANTILLA_DE_CLASIFICACION = """\
Clasificas la pregunta de un oncólogo sobre un paciente en una intención.

Intenciones: "caso" (situación y datos del paciente), "faltantes" (qué información falta), "evidencia" (evidencia científica) y "fuentes_limitaciones" (de dónde sale la información y sus límites).

Instrucciones:
- Devuelve únicamente el JSON conforme al esquema, con una de las cuatro intenciones.
- {linea_de_datos}
- La pregunta va en <question>.
"""


def armar_prompt_de_clasificacion(pregunta: str) -> PromptSeparado:
    """La clasificación de la pregunta cuando ninguna regla la resolvió: solo la pregunta, en su bloque."""
    instrucciones = PLANTILLA_DE_CLASIFICACION.format(
        linea_de_datos=linea_de_datos_no_instrucciones()
    )
    return PromptBuilder(instrucciones, VERSION_DEL_PROMPT_DE_CHAT).pregunta(pregunta).construir()


def armar_prompt_del_turno(
    estado: EstadoDelHilo,
    pregunta: str,
    hechos: Sequence[HechoDelCaso],
    intencion: Intencion,
    ventana: Sequence[TurnoPrevio],
) -> PromptSeparado:
    """El prompt de un nodo de capacidad: pregunta, hechos del caso y memoria (estado estructurado + ventana de turnos)."""
    instrucciones = PLANTILLA_DEL_TURNO.format(
        intencion=intencion.value,
        rotulo_de_la_memoria=ROTULO_DE_LA_MEMORIA,
        linea_de_datos=linea_de_datos_no_instrucciones(),
    )
    return (
        PromptBuilder(instrucciones, VERSION_DEL_PROMPT_DE_CHAT)
        .pregunta(pregunta)
        .memoria(_texto_de_la_memoria(estado, ventana))
        .datos_del_paciente(_texto_de_los_hechos(hechos))
        .construir()
    )


def _texto_de_los_hechos(hechos: Sequence[HechoDelCaso]) -> str:
    return "\n".join(_linea_de_hecho(h) for h in hechos) or SIN_DATOS


def _linea_de_hecho(hecho: HechoDelCaso) -> str:
    dia = (
        "sin fecha confiable"
        if hecho.dia_relativo is None
        else f"día relativo {hecho.dia_relativo}"
    )
    conflicto = f"; en conflicto con {hecho.conflicto_con}" if hecho.conflicto_con else ""
    return f"[{hecho.ref}] {hecho.verbalizacion} ({dia}; revisión: {hecho.estado_de_revision}{conflicto})"


def _texto_de_la_memoria(estado: EstadoDelHilo, ventana: Sequence[TurnoPrevio]) -> str:
    estructurado = estado.estructurado
    evidencia = estructurado.ultima_evidencia
    ultima = (
        SIN_DATOS
        if evidencia is None
        # Solo si hubo o no evidencia: el puntaje crudo es metadato secundario y no entra al prompt (RN-03).
        else f"{evidencia.query} | chunks: {', '.join(evidencia.chunk_ids)} | "
        f"{'sin evidencia' if evidencia.top_relevance_score is None else 'con evidencia'}"
    )
    lineas = [
        "Estado de la conversación:",
        f"- Intenciones vistas: {', '.join(estructurado.intents_vistos) or SIN_DATOS}",
        *(f"- Pregunta previa: {p}" for p in estructurado.preguntas_previas),
        f"- Opciones mostradas: {', '.join(estructurado.opciones_mostradas) or SIN_DATOS}",
        f"- Citas mostradas: {', '.join(estructurado.citas_mostradas) or SIN_DATOS}",
        f"- Faltantes señalados: {', '.join(estructurado.faltantes_senalados) or SIN_DATOS}",
        f"- Última evidencia: {ultima}",
        "Turnos previos:",
        *(texto_de_turno(t) for t in ventana),
    ]
    return "\n".join(lineas)
