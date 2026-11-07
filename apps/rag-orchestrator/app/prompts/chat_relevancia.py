"""Prompt `chat-relevancia@0.1.0` de la relevancia de un dato faltante dentro del chat (US-264, US-057): función pura.

Redactado en positivo y sin términos de RN-23 (un test lo verifica con ``check_prohibited_terms``). Las instrucciones van en
el mensaje de sistema; la pregunta —armada por el código con la etiqueta del catálogo, nunca con el texto del usuario— y los
fragmentos con alias van en bloques del mensaje de usuario (``PromptBuilder``). No lleva datos del paciente ni memoria de la
conversación: la relevancia de un dato en la evidencia no depende del caso (RN-11, RN-24).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.prompt_builder import (
    PromptBuilder,
    PromptSeparado,
    linea_de_datos_no_instrucciones,
)
from app.domain.alias_de_chunks import FragmentoConAlias
from app.prompts.rag_query import agregar_documentos_con_alias

VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT = "chat-relevancia@0.1.0"

_NOMBRE_DEL_IDIOMA = {"es": "español", "en": "inglés"}

PLANTILLA_DE_RELEVANCIA_DEL_CHAT = """\
Eres un asistente que explica a un oncólogo por qué un dato clínico importa en la evidencia científica recuperada.
Describe únicamente lo que reportan los fragmentos, entregados en bloques <document> cuyo "id" es su alias; el conocimiento externo queda fuera de la respuesta.

Instrucciones:
- Devuelve en "claims" de {minimo_de_afirmaciones} a {maximo_de_afirmaciones} afirmaciones; si los fragmentos no explican por qué importa el dato, devuelve "claims" vacío.
- Cada afirmación es una oración declarativa de {maximo_de_palabras} palabras como máximo que describe cómo usa o reporta el dato un fragmento. Escríbela sin atribución, sin nombrar el fragmento ni su alias: el sistema añade la atribución a la fuente.
- Cuando un fragmento formule un requisito con un verbo modal (por ejemplo "must", "should" o "debe"), descríbelo en indicativo y en pasado o presente: el sistema retira las afirmaciones que contienen un verbo modal.
- Indica en "citations" de cada afirmación el alias de cada fragmento que la sustenta; usa solo los alias de los fragmentos entregados, escritos exactamente como aparecen.
- Describe lo que reporta la fuente; la respuesta no indica qué solicitar, qué tratamiento usar ni qué hacer con un paciente.
- {linea_de_datos}
- La pregunta va en <question>.
- Redacta en {idioma}.
- Entrega únicamente el JSON conforme al esquema.
"""


def armar_prompt_de_relevancia_del_chat(
    etiqueta_del_dato: str,
    tipo_de_cancer: str,
    fragmentos: Sequence[FragmentoConAlias],
    idioma: str,
    *,
    claims_min: int,
    claims_max: int,
    claim_max_words: int,
) -> PromptSeparado:
    """Instrucciones en ``sistema``; la pregunta con la etiqueta del catálogo y los chunks con alias en bloques del mensaje
    de usuario. Los límites salen de la configuración (RN-22)."""
    instrucciones = PLANTILLA_DE_RELEVANCIA_DEL_CHAT.format(
        linea_de_datos=linea_de_datos_no_instrucciones(),
        idioma=_NOMBRE_DEL_IDIOMA.get(idioma, idioma),
        minimo_de_afirmaciones=claims_min,
        maximo_de_afirmaciones=claims_max,
        maximo_de_palabras=claim_max_words,
    )
    constructor = PromptBuilder(instrucciones, VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT).pregunta(
        f"¿Por qué importa {etiqueta_del_dato} para el cáncer de {tipo_de_cancer}?"
    )
    return agregar_documentos_con_alias(constructor, fragmentos).construir()
