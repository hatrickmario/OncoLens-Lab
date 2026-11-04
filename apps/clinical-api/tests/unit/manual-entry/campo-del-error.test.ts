import { describe, expect, it } from 'vitest';
import {
  CuerpoIncompletoError,
  GradacionIncoherenteError,
  PacienteEgresadoError,
  ValorFueraDeCatalogoError,
} from '../../../src/modules/manual-entry/manual-entry.errores.js';
import { campoDelError } from '../../../src/modules/manual-entry/manual-entry.reglas.js';

describe('campoDelError', () => {
  it('devuelve el nombre del campo cuando el valor está fuera del catálogo', () => {
    expect(campoDelError(new ValorFueraDeCatalogoError('performanceValue'))).toBe(
      'performanceValue',
    );
  });

  it('devuelve la propiedad de primer nivel cuando el campo fuera del catálogo es anidado', () => {
    expect(campoDelError(new ValorFueraDeCatalogoError('grading.gradingSystem'))).toBe('grading');
  });

  it('devuelve grading cuando la gradación es incoherente', () => {
    expect(campoDelError(new GradacionIncoherenteError('gleasonScore'))).toBe('grading');
  });

  it('devuelve el campo faltante cuando el cuerpo está incompleto', () => {
    expect(campoDelError(new CuerpoIncompletoError('stageValue'))).toBe('stageValue');
  });

  it('devuelve undefined cuando el error no es de un campo', () => {
    expect(campoDelError(new PacienteEgresadoError())).toBeUndefined();
    expect(campoDelError(new Error('otro'))).toBeUndefined();
  });
});
