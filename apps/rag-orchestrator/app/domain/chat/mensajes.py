"""Textos fijos del chat que no genera el LLM: mensajes del sistema de `fuera_de_alcance` y `no_clasificada`.

Deterministas y sin eco: no repiten ninguna parte de la pregunta (que puede traer datos del paciente) ni un marcador de
enmascarado (glosario S6 §3, CLA-3). Los mensajes del sistema no son contenido generado por IA (RN-19): sin ``notices``.
"""

MENSAJE_FUERA_DE_ALCANCE = (
    "Esta conversación solo responde sobre el paciente y el tipo de cáncer del caso abierto. "
    "Formula la pregunta sobre ese caso."
)
MENSAJE_EVIDENCIA_NO_CONSULTADA = "no implementado"
MENSAJE_NO_CLASIFICADA = (
    "No pude clasificar la pregunta. Reformúlala indicando si se refiere a la situación del caso, "
    "a los datos que faltan o a la evidencia científica."
)
