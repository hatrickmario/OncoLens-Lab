import { afterEach, describe, expect, it, vi } from 'vitest';
import { contrasenaDeTest } from '../support/usuarios.js';

afterEach(() => vi.unstubAllEnvs());

describe('contrasenaDeTest', () => {
  it.each(['TEST_DOC1_PASSWORD', 'TEST_DOC2_PASSWORD'] as const)(
    'devuelve el valor de %s del entorno de test',
    (variable) => {
      vi.stubEnv(variable, 'SINT-valor-de-prueba');

      expect(contrasenaDeTest(variable)).toBe('SINT-valor-de-prueba');
    },
  );

  it.each(['TEST_DOC1_PASSWORD', 'TEST_DOC2_PASSWORD'] as const)(
    'falla nombrando %s cuando falta o está vacía',
    (variable) => {
      vi.stubEnv(variable, '');

      expect(() => contrasenaDeTest(variable)).toThrow(variable);
    },
  );

  it('no acepta SEED_DOCTOR_PASSWORD: es la variable del seed de demo de L1D-169, no de los tests', () => {
    vi.stubEnv('SEED_DOCTOR_PASSWORD', 'SINT-del-seed-de-demo');

    // @ts-expect-error solo se admiten variables TEST_DOC*
    expect(() => contrasenaDeTest('SEED_DOCTOR_PASSWORD')).toThrow(/SEED_DOCTOR_PASSWORD/);
  });
});
