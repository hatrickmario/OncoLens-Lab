import { describe, expect, it } from 'vitest';
import { columnasDeGradacion } from '../../../prisma/seed/columnas-de-gradacion.js';

describe('columnasDeGradacion', () => {
  it('devuelve patrones, puntaje e ISUP derivados y Nottingham nulo cuando la gradación es gleason_isup', () => {
    const columnas = columnasDeGradacion({
      sistema: 'gleason_isup',
      patronPrimario: 4,
      patronSecundario: 3,
      muestra: { specimenType: 'biopsia', gradeScope: 'peor' },
    });

    expect(columnas).toEqual({
      grading_system: 'gleason_isup',
      specimen_type: 'biopsia',
      grade_scope: 'peor',
      gleason_primary_pattern: 4,
      gleason_secondary_pattern: 3,
      gleason_score: 7,
      isup_grade_group: 3,
      nottingham_grade: null,
    });
  });

  it('devuelve el grado y deja nulos los campos de Gleason cuando la gradación es nottingham', () => {
    expect(columnasDeGradacion({ sistema: 'nottingham', grado: 2 })).toEqual({
      grading_system: 'nottingham',
      specimen_type: null,
      grade_scope: null,
      gleason_primary_pattern: null,
      gleason_secondary_pattern: null,
      gleason_score: null,
      isup_grade_group: null,
      nottingham_grade: 2,
    });
  });
});
