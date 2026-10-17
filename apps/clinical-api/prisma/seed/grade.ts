/** Gradación de referencia de un diagnóstico (`clinical.diagnosis_grading`, DEC-05). */
export type GradacionDeReferencia =
  | {
      readonly sistema: 'gleason_isup';
      readonly patronPrimario: number;
      readonly patronSecundario: number;
      readonly puntaje: number;
      readonly grupoIsup: number;
    }
  | { readonly sistema: 'nottingham'; readonly grado: number };

/**
 * `Diagnosis.grade` es texto canónico derivado, nunca escrito a mano (DEC-05, data-model §6): próstata
 * `"Gleason 4+3=7 · ISUP 3"`, mama `"Nottingham grado 2"`. Reutilizable por US-110 / FEAT-01b.
 */
export function derivarTextoGrade(gradacion: GradacionDeReferencia): string {
  if (gradacion.sistema === 'nottingham') return `Nottingham grado ${gradacion.grado}`;
  return `Gleason ${gradacion.patronPrimario}+${gradacion.patronSecundario}=${gradacion.puntaje} · ISUP ${gradacion.grupoIsup}`;
}

/** Puntaje de Gleason y grupo ISUP derivados de los patrones (DEC-05, data-model §6). */
export function derivarGleason(
  _patronPrimario: number,
  _patronSecundario: number,
): { readonly puntaje: number; readonly grupoIsup: number } {
  throw new Error('no implementado');
}
