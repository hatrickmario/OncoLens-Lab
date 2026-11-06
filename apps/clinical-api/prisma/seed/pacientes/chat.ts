/**
 * `P-CHAT` (FX-12-b, L1D-315): paciente sintético del chat. Su identidad sintética es PII de mentira (RN-13, RN-14) que
 * los tests de no fuga siembran en la pregunta (FX-12-d) y en el texto libre; el literal vive solo aquí.
 */
export const NOMBRE_SINTETICO_CHAT = 'Lucía Prueba Chat';
export const DOCUMENTO_SINTETICO_CHAT = 'SINT-CHAT-0001';
/** Fecha de nacimiento sintética de la pregunta FX-12-d (formato absoluto que el detector debe enmascarar). */
export const NACIMIENTO_SINTETICO_CHAT = '1970-03-02';

/** Pacientes que el seed crea además de `PACIENTES_SEMILLA`: solo `P-CHAT`. */
export const PACIENTES_ADICIONALES_DEL_SEED = 1;

/** Clave del paciente en el seed (de ella salen los ids sembrados). */
export const PACIENTE_CHAT = 'paciente-chat';
