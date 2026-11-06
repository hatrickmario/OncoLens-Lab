"""Valores iniciales de la configuración del chat (RN-22, a calibrar): el único lugar donde aparecen sus literales."""

CHAT_THREAD_TTL_SEGUNDOS_INICIAL = 1800
CHAT_MAX_HILOS_INICIAL = 50
CHAT_MEMORY_MAX_TOKENS_INICIAL = 1500

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
