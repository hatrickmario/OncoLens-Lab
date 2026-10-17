import { derivarGleason } from './grade.js';
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
export function columnasDeGradacion(gradacion: GradacionSemilla): ColumnasDeGradacion {
  switch (gradacion.sistema) {
    case 'gleason_isup': {
      const { patronPrimario, patronSecundario, muestra } = gradacion;
      const { puntaje, grupoIsup } = derivarGleason(patronPrimario, patronSecundario);
      return {
        grading_system: gradacion.sistema,
        specimen_type: muestra?.specimenType ?? null,
        grade_scope: muestra?.gradeScope ?? null,
        gleason_primary_pattern: patronPrimario,
        gleason_secondary_pattern: patronSecundario,
        gleason_score: puntaje,
        isup_grade_group: grupoIsup,
        nottingham_grade: null,
      };
    }
    case 'nottingham':
      return {
        grading_system: gradacion.sistema,
        specimen_type: null,
        grade_scope: null,
        gleason_primary_pattern: null,
        gleason_secondary_pattern: null,
        gleason_score: null,
        isup_grade_group: null,
        nottingham_grade: gradacion.grado,
      };
    default: {
      const sistemaNoCubierto: never = gradacion;
      throw new Error(`Sistema de gradación no cubierto: ${JSON.stringify(sistemaNoCubierto)}`);
    }
  }
}
