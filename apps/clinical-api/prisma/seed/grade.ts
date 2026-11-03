import {
  derivarGleason,
  textoDeGrado,
} from '../../src/modules/manual-entry/manual-entry.reglas.js';

/** Gradación de referencia de un diagnóstico (`clinical.diagnosis_grading`, DEC-05). */
export type GradacionDeReferencia =
  | {
      readonly sistema: 'gleason_isup';
      readonly patronPrimario: number;
      readonly patronSecundario: number;
    }
  | { readonly sistema: 'nottingham'; readonly grado: number };

/** Una sola fuente de la regla (L1D-90, DEC-05): el seed reutiliza la derivación del registro manual. */
export { derivarGleason };

/**
 * `Diagnosis.grade` es texto canónico derivado, nunca escrito a mano (DEC-05, data-model §6): próstata
 * `"Gleason 4+3=7 · ISUP 3"`, mama `"Nottingham grado 2"`. Delegado en `textoDeGrado` del registro manual.
 */
export function derivarTextoGrade(gradacion: GradacionDeReferencia): string {
  if (gradacion.sistema === 'nottingham') {
    return textoDeGrado({
      gradingSystem: 'nottingham',
      nottinghamGrade: gradacion.grado,
      gleasonPrimaryPattern: null,
      gleasonSecondaryPattern: null,
    });
  }
  return textoDeGrado({
    gradingSystem: 'gleason_isup',
    nottinghamGrade: null,
    gleasonPrimaryPattern: gradacion.patronPrimario,
    gleasonSecondaryPattern: gradacion.patronSecundario,
  });
}
