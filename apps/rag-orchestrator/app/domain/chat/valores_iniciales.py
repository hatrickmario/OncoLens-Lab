"""Valores iniciales de la configuración del chat (RN-22, a calibrar): el único lugar donde aparecen sus literales."""

CHAT_THREAD_TTL_SEGUNDOS_INICIAL = 1800
CHAT_MAX_HILOS_INICIAL = 50
CHAT_MEMORY_MAX_TOKENS_INICIAL = 1500
CHAT_EVIDENCE_MAX_OPTIONS_INICIAL = 3
"""Opciones que muestra el turno de evidencia del chat: el mismo tope que el análisis (FR-09, ``maxOptions`` de 1 a 3)."""

AVISO_DE_IA_INICIAL = (
    "Generado por IA; requiere validación clínica independiente por el oncólogo tratante"
)
AVISO_ACADEMICO_INICIAL = "Uso académico/investigación"
AVISO_VERIFICAR_FUENTES_INICIAL = "Verifique contra las fuentes"
"""Los avisos de RN-19 sin punto final, como en la configuración de Backend 1 (glosario S6 §3)."""

CHAT_SIN_DATOS_TEXTO_INICIAL = (
    "No se encontró información documentada sobre lo preguntado en el expediente"
)
"""Texto fijo del bloque ``limitacion`` de un turno de caso sin ningún dato documentado (US-261 AC-4, RN-01)."""

CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL = "No se encontró información documentada en el periodo consultado; el expediente tiene datos fuera de ese periodo"
"""Texto fijo del turno de caso con periodo cuando el filtro dejó sin hechos pero el expediente sí tiene datos (US-261)."""
CHAT_CONFLICTO_ETIQUETA_INICIAL = "Por conciliar"
"""Etiqueta con que el bloque ``conflicto`` del chat nombra un par de datos en conflicto (US-262, RN-08, RN-22)."""
CHAT_SIN_CONTRADICCIONES_TEXTO_INICIAL = "No hay contradicciones registradas en el expediente"
"""Texto fijo del bloque ``limitacion`` cuando se pregunta por contradicciones y ningún dato está en conflicto (US-262)."""
CHAT_CONTRADICCIONES_ALCANCE_TEXTO_INICIAL = (
    "Se revisaron los diagnósticos y biomarcadores del expediente"
)
"""Segunda frase de la respuesta sin contradicciones: la revisión solo cubre los datos con vínculo de conflicto (RN-08)."""
CHAT_CONFLICTO_SIN_CONTRAPARTE_TEXTO_INICIAL = (
    "Hay datos marcados en conflicto cuya contraparte no está entre los datos consultados"
)
"""Aviso cuando un hecho marcado en conflicto llega sin su contraparte: no se afirma que no hay contradicciones."""
CHAT_SIN_FECHA_TEXTO_INICIAL = "Se omitieron <n> dato(s) del expediente sin fecha confiable; no se pudieron ubicar en el periodo consultado"
"""Aviso no bloqueante cuando el filtro por periodo deja fuera hechos sin fecha confiable; ``<n>`` es su cantidad (no ``{n}``: la llave rompe el valor por defecto de Compose)."""

CHAT_AVISO_BUSQUEDA_AMPLIADA_INICIAL = "La búsqueda se amplió con datos del caso"
"""Prefijo del aviso de ``notices[]`` cuando el turno usó el segundo loop contextual (US-271, ADR-52, RN-22); sigue «: » y los
nombres de los campos usados, nunca valores."""

CHAT_RELEVANCIA_CATALOGO_TEXTO_INICIAL = (
    "<dato> es un dato crítico del catálogo vigente (versión <version>)."
)
"""Primera frase del bloque ``catalogo`` de la relevancia de un dato (US-264, RN-29); ``<dato>`` y ``<version>`` los rellena
el código (no ``{}``: la llave rompe el valor por defecto de Compose)."""
CHAT_RELEVANCIA_CRITERIOS_TEXTO_INICIAL = (
    "Criterios de aplicabilidad del catálogo que lo usan: <criterios>."
)
"""Segunda frase cuando algún criterio de ``aplicabilidad.json`` usa el dato; ``<criterios>`` son sus etiquetas."""
CHAT_RELEVANCIA_SIN_CRITERIO_TEXTO_INICIAL = (
    "Ningún criterio de aplicabilidad del catálogo vigente usa este dato."
)
"""Segunda frase cuando ningún criterio usa el dato (p. ej. Ki-67 en mama): texto fijo, sin contenido clínico inventado."""
CHAT_RELEVANCIA_SIN_SOPORTE_TEXTO_INICIAL = (
    "La evidencia recuperada no explica la relevancia de este dato."
)
"""Bloque ``limitacion`` cuando ninguna explicación del LLM tiene soporte (US-264 AC-2, RN-01)."""
CHAT_RELEVANCIA_FUERA_DEL_CATALOGO_TEXTO_INICIAL = (
    "Lo consultado no es un dato crítico del catálogo vigente; no se explica su relevancia."
)
"""Respuesta cuando la pregunta no corresponde a ningún dato de ``datos-criticos`` (US-264 AC-5, RN-29)."""
CHAT_RELEVANCIA_SIN_EVIDENCIA_AVISO_INICIAL = (
    "Sin evidencia: ningún fragmento recuperado supera el umbral de relevancia para este dato"
)
"""Aviso de ``notices[]`` del turno de relevancia sin chunks sobre el umbral (US-264 AC-3, RN-02), sin punto final."""
