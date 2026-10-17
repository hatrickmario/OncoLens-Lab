/** Gradación de referencia de un diagnóstico (`clinical.diagnosis_grading`, DEC-05). */
export type GradacionDeReferencia =
  | {
      readonly sistema: 'gleason_isup';
      readonly patronPrimario: number;
      readonly patronSecundario: number;
    }
  | { readonly sistema: 'nottingham'; readonly grado: number };

/** Puntaje de Gleason y grupo ISUP derivados de los patrones (DEC-05, data-model §6). Única fuente de la regla. */
export function derivarGleason(
  patronPrimario: number,
  patronSecundario: number,
): { readonly puntaje: number; readonly grupoIsup: number } {
  const puntaje = patronPrimario + patronSecundario;
  return { puntaje, grupoIsup: grupoIsupDe(puntaje, patronPrimario) };
}

function grupoIsupDe(puntaje: number, patronPrimario: number): number {
  if (puntaje <= 6) return 1;
  if (puntaje === 7) return patronPrimario === 3 ? 2 : 3;
  return puntaje === 8 ? 4 : 5;
}

/**
 * `Diagnosis.grade` es texto canónico derivado, nunca escrito a mano (DEC-05, data-model §6): próstata
 * `"Gleason 4+3=7 · ISUP 3"`, mama `"Nottingham grado 2"`. Reutilizable por US-110 / FEAT-01b.
 */
export function derivarTextoGrade(gradacion: GradacionDeReferencia): string {
  if (gradacion.sistema === 'nottingham') return `Nottingham grado ${gradacion.grado}`;
  const { patronPrimario, patronSecundario } = gradacion;
  const { puntaje, grupoIsup } = derivarGleason(patronPrimario, patronSecundario);
  return `Gleason ${patronPrimario}+${patronSecundario}=${puntaje} · ISUP ${grupoIsup}`;
}
