"""Textos fijos del chat que no genera el LLM: mensajes del sistema de `fuera_de_alcance` y `no_clasificada`, y la
limitación de la intención `evidencia` mientras su nodo sea un esqueleto.

Deterministas, en voz impersonal (nada que se dirija al oncólogo con un imperativo) y sin eco: no repiten ninguna parte de
la pregunta (que puede traer datos del paciente) ni un marcador de enmascarado (glosario S6 §3, CLA-3). Los mensajes del
sistema no son contenido generado por IA (RN-19): sin ``notices``. Ninguno contiene términos de RN-23 (un test lo verifica).
"""

MENSAJE_FUERA_DE_ALCANCE = (
    "Esta conversación solo trata del paciente y del tipo de cáncer del caso abierto. "
    "La pregunta puede formularse sobre ese caso."
)
MENSAJE_NO_CLASIFICADA = (
    "No se pudo clasificar la pregunta. Puede reformularse indicando si se refiere a la situación del caso, "
    "a los datos que faltan o a la evidencia científica."
)
MENSAJE_EVIDENCIA_NO_CONSULTADA = (
    "Esta respuesta describe los datos registrados del paciente; "
    "la evidencia científica no se consultó en este turno"
)

ENCABEZADO_DE_OPCIONES = "Opciones descritas en la evidencia"
"""Encabezado del bloque `evidencia` (RN-23): describe lo que reporta la fuente; no recomienda."""
MENSAJE_SIN_OPCIONES_CON_SOPORTE = (
    "Los fragmentos recuperados no sostienen ninguna opción con soporte suficiente."
)
