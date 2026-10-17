import { describe, expect, it } from 'vitest';
import {
  PermisoDenegadoError,
  exigirRolDoctor,
} from '../../../src/modules/evidence-analysis/evidence-analysis.controller.js';

describe('exigirRolDoctor', () => {
  it('devuelve la sesión cuando el rol es doctor', () => {
    const sesion = { userId: 'usuario-sintetico', rol: 'doctor' as const };

    expect(exigirRolDoctor(sesion)).toBe(sesion);
  });

  it('rechaza con PermisoDenegadoError cuando el rol es admin', () => {
    expect(() => exigirRolDoctor({ userId: 'usuario-sintetico', rol: 'admin' })).toThrow(
      PermisoDenegadoError,
    );
  });

  it('rechaza con PermisoDenegadoError cuando no hay sesión', () => {
    expect(() => exigirRolDoctor(undefined)).toThrow(PermisoDenegadoError);
  });
});
