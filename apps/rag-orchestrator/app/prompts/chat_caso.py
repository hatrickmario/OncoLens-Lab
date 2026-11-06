"""Prompt del nodo ``caso`` del chat `chat-caso@0.1.0` (US-260, ADR-34): función pura, sin E/S.

Las instrucciones van en el mensaje de sistema y todo dato (pregunta, hechos del caso, memoria) en un bloque delimitado del
de usuario, armados con ``PromptBuilder``; la memoria solo entra por ``PromptBuilder.memoria()`` (RN-24). El LLM describe la
situación o la evolución del caso con afirmaciones atómicas, cada una con las referencias de los hechos que la sustentan:
el nodo verifica después cada afirmación contra la verbalización determinista de esos hechos. Solo recibe texto ya
enmascarado y fechas relativas: nunca el ``pseudoPatientId`` (RN-11). Redactado en positivo y sin términos de RN-23.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.prompt_builder import (
    PromptBuilder,
    PromptSeparado,
    linea_de_datos_no_instrucciones,
)
from app.domain.chat.estado import EstadoDelHilo, TurnoPrevio
from app.domain.chat.turno import HechoDelCaso
from app.prompts.chat import ROTULO_DE_LA_MEMORIA, texto_de_la_memoria, texto_de_los_hechos

VERSION_DEL_PROMPT_DE_CASO = "chat-caso@0.1.0"

PLANTILLA_DEL_CASO = """\
Eres un asistente que describe a un oncólogo la situación y la evolución del caso de su paciente.
Describe únicamente lo que reportan los datos del paciente, entregados en <patient_data> con una referencia por dato (f1, f2…); el conocimiento externo queda fuera de la respuesta.

Instrucciones:
- Devuelve en "claims" afirmaciones declarativas breves, cada una sobre un solo dato o un solo hallazgo del caso.
- Escribe cada afirmación con las mismas cifras, unidades y términos del dato que la sustenta; un dato "sin verificar" o "requiere revisión" se describe como tal.
- Indica en "factRefs" de cada afirmación las referencias de los datos que la sustentan; usa solo las referencias entregadas, escritas exactamente como aparecen.
- Para la evolución de un valor, una afirmación por medición, con su día relativo tal como figura en el dato.
- Si el dato pedido no figura en <patient_data>, devuelve "claims" vacío.
- Deja "citations" vacío: en esta etapa no se entregan fragmentos de evidencia.
- El bloque <memory> ({rotulo_de_la_memoria}) solo sitúa la pregunta: no es evidencia, no se cita y no sustenta ninguna afirmación.
- {linea_de_datos}
- La pregunta va en <question>.
- Redacta en español.
- Entrega únicamente el JSON conforme al esquema.
"""


def armar_prompt_del_caso(
    estado: EstadoDelHilo,
    pregunta: str,
    hechos: Sequence[HechoDelCaso],
    ventana: Sequence[TurnoPrevio],
) -> PromptSeparado:
    """El prompt del nodo ``caso``: pregunta, hechos del caso y memoria (estado estructurado + ventana de turnos)."""
    instrucciones = PLANTILLA_DEL_CASO.format(
        rotulo_de_la_memoria=ROTULO_DE_LA_MEMORIA,
        linea_de_datos=linea_de_datos_no_instrucciones(),
    )
    return (
        PromptBuilder(instrucciones, VERSION_DEL_PROMPT_DE_CASO)
        .pregunta(pregunta)
        .memoria(texto_de_la_memoria(estado, ventana))
        .datos_del_paciente(texto_de_los_hechos(hechos))
        .construir()
    )
