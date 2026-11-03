import { readPositiveInteger } from './secciones.js';

export interface CorreccionesConfig {
  /** `CLINICAL_NOTE_MAX_CHARS`: caracteres máximos del texto de una nota clínica corregida (RN-22). */
  clinicalNoteMaxChars: number;
  /** `CORRECTION_HISTORY_MAX`: versiones reemplazadas máximas que devuelve un histórico (RN-22). */
  correctionHistoryMax: number;
}

const NOTA_MAX_CHARS_POR_DEFECTO = 2000;
const HISTORIAL_MAX_POR_DEFECTO = 50;

/** Corrección con histórico (US-253): los límites de texto y de histórico no son literales del dominio (RN-22). */
export function readCorreccionesConfig(env: NodeJS.ProcessEnv): CorreccionesConfig {
  return {
    clinicalNoteMaxChars: readPositiveInteger(
      env,
      'CLINICAL_NOTE_MAX_CHARS',
      NOTA_MAX_CHARS_POR_DEFECTO,
    ),
    correctionHistoryMax: readPositiveInteger(
      env,
      'CORRECTION_HISTORY_MAX',
      HISTORIAL_MAX_POR_DEFECTO,
    ),
  };
}
