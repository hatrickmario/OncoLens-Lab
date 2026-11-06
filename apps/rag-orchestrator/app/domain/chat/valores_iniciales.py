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
