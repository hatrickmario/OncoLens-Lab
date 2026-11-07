"""Prompt `chat-seguimiento-evidencia@0.1.0` del seguimiento de un análisis dentro del chat (US-265, US-057): función pura.

Redactado en positivo y sin términos de RN-23 (un test lo verifica con ``check_prohibited_terms``). La conversación previa
viaja en un bloque ``<memory citable="no">`` del mensaje de usuario (``PromptBuilder.memoria()``), separado de los
fragmentos con alias (RN-24); nunca con los rótulos ``INICIO_DE_LA_MEMORIA`` / ``FIN_DE_LA_MEMORIA``. El prompt solo recibe
campos ya enmascarados: nunca el ``pseudoPatientId`` ni el identificador del análisis activo (RN-11).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.prompt_builder import (
    PromptBuilder,
    PromptSeparado,
    linea_de_datos_no_instrucciones,
)
from app.domain.alias_de_chunks import FragmentoConAlias
from app.prompts.rag_query import (
    ETIQUETA_EN_CONFLICTO,
    ETIQUETA_SIN_VERIFICAR,
    agregar_documentos_con_alias,
)

VERSION_DEL_PROMPT_DE_SEGUIMIENTO_DEL_CHAT = "chat-seguimiento-evidencia@0.1.0"

ROTULO_DE_LA_MEMORIA = "Conversación previa (no es evidencia; no la cites)"
SIN_DATOS = "No disponible"

_NOMBRE_DEL_IDIOMA = {"es": "español", "en": "inglés"}

PLANTILLA_SEGUIMIENTO_DEL_CHAT = """\
Eres un asistente que responde preguntas de seguimiento sobre un análisis de evidencia científica ya mostrado en una conversación con un oncólogo.
Describe únicamente lo que reportan los fragmentos, entregados en bloques <document> cuyo "id" es su alias; el conocimiento externo queda fuera de la respuesta.

Instrucciones:
- Devuelve en "claims" de {minimo_de_afirmaciones} a {maximo_de_afirmaciones} afirmaciones; si los fragmentos no responden la pregunta, devuelve "claims" vacío.
- Cada afirmación es una oración declarativa de {maximo_de_palabras} palabras como máximo que describe lo que reporta un fragmento. Escríbela sin atribución, sin nombrar el fragmento ni su alias: el sistema añade la atribución a la fuente.
- Cuando un fragmento formule un requisito de inclusión o de elegibilidad con un verbo modal (por ejemplo "must", "should" o "debe"), descríbelo en indicativo y en pasado o presente: el sistema retira las afirmaciones que contienen un verbo modal.
- Indica en "citations" de cada afirmación el alias de cada fragmento que la sustenta; usa solo los alias de los fragmentos entregados, escritos exactamente como aparecen.
- El bloque <memory> ({rotulo_de_la_memoria}) solo sitúa la pregunta: no es evidencia, no se cita y no sustenta ninguna afirmación.
- Cuando describas lo que establece una guía, indica la población y el escenario a los que se refiere \
(para pacientes con [condición] en [escenario]), atribúyelo a la fuente citada y no lo dirijas al paciente.
- {linea_de_datos}
- Los datos del paciente van en <patient_data>; las etiquetas "{etiqueta_sin_verificar}" y "{etiqueta_en_conflicto}" indican el estado de revisión del dato y no forman parte del dato.
- La pregunta va en <question>.
- Redacta en {idioma}.
- Entrega únicamente el JSON conforme al esquema.
"""


def armar_prompt_de_seguimiento_del_chat(
    pregunta: str,
    fragmentos: Sequence[FragmentoConAlias],
    memoria: str,
    datos_del_paciente: str,
    idioma: str,
    *,
    claims_min: int,
    claims_max: int,
    claim_max_words: int,
) -> PromptSeparado:
    """Instrucciones en ``sistema``; pregunta enmascarada, memoria no citable, datos del paciente y chunks con alias en
    bloques del mensaje de usuario. Los límites salen de la configuración (RN-22)."""
    instrucciones = PLANTILLA_SEGUIMIENTO_DEL_CHAT.format(
        linea_de_datos=linea_de_datos_no_instrucciones(),
        etiqueta_sin_verificar=ETIQUETA_SIN_VERIFICAR,
        etiqueta_en_conflicto=ETIQUETA_EN_CONFLICTO,
        idioma=_NOMBRE_DEL_IDIOMA.get(idioma, idioma),
        minimo_de_afirmaciones=claims_min,
        maximo_de_afirmaciones=claims_max,
        maximo_de_palabras=claim_max_words,
        rotulo_de_la_memoria=ROTULO_DE_LA_MEMORIA,
    )
    constructor = (
        PromptBuilder(instrucciones, VERSION_DEL_PROMPT_DE_SEGUIMIENTO_DEL_CHAT)
        .pregunta(pregunta)
        .memoria(memoria or SIN_DATOS)
        .datos_del_paciente(datos_del_paciente or SIN_DATOS)
    )
    return agregar_documentos_con_alias(constructor, fragmentos).construir()
