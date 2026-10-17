import { describe, expect, it } from 'vitest';
import { tablasAusentes } from '../support/catalogo.js';

describe('tablasAusentes', () => {
  it('nombra la tabla ausente cuando el catálogo no tiene una del modelo', () => {
    const esperadas = ['clinical.patient', 'clinical.diagnosis_grading'];

    expect(tablasAusentes(esperadas, ['clinical.patient'])).toEqual(['clinical.diagnosis_grading']);
  });

  it('devuelve vacío cuando el catálogo tiene todas las tablas del modelo', () => {
    expect(tablasAusentes(['a.x'], ['a.x', 'b.y'])).toEqual([]);
  });
});
