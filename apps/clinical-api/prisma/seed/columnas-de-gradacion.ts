import type { GradacionSemilla } from './pacientes/tipos.js';

/** Columnas de `clinical.diagnosis_grading` que dependen del sistema de gradación (data-model §6). */
export interface ColumnasDeGradacion {
  readonly grading_system: string;
  readonly specimen_type: string | null;
  readonly grade_scope: string | null;
  readonly gleason_primary_pattern: number | null;
  readonly gleason_secondary_pattern: number | null;
  readonly gleason_score: number | null;
  readonly isup_grade_group: number | null;
  readonly nottingham_grade: number | null;
}

/** Valores de cada sistema, con los CHECK del esquema: Gleason deja Nottingham nulo y viceversa. */
export function columnasDeGradacion(_gradacion: GradacionSemilla): ColumnasDeGradacion {
  throw new Error('no implementado');
}
