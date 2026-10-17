import { describe, expect, it } from 'vitest';
import { readAuthConfig } from '../../src/config.js';

describe('readAuthConfig', () => {
  it('usa 8 horas y el mínimo de OWASP para Argon2id cuando no hay variables', () => {
    expect(readAuthConfig({})).toEqual({
      sessionTtlHours: 8,
      argon2: { memoryCostKib: 19456, timeCost: 2, parallelism: 1 },
    });
  });

  it('lee los valores de las variables de entorno', () => {
    expect(
      readAuthConfig({
        SESSION_TTL_HOURS: '4',
        ARGON2_MEMORY_COST_KIB: '8',
        ARGON2_TIME_COST: '1',
        ARGON2_PARALLELISM: '2',
      }),
    ).toEqual({ sessionTtlHours: 4, argon2: { memoryCostKib: 8, timeCost: 1, parallelism: 2 } });
  });

  it('trata una variable vacía como ausente', () => {
    expect(readAuthConfig({ SESSION_TTL_HOURS: '' }).sessionTtlHours).toBe(8);
  });

  it.each([
    'SESSION_TTL_HOURS',
    'ARGON2_MEMORY_COST_KIB',
    'ARGON2_TIME_COST',
    'ARGON2_PARALLELISM',
  ])('rechaza %s cuando no es un entero positivo, nombrando la variable', (variable) => {
    for (const valor of ['0', '-1', '1.5', 'abc']) {
      expect(() => readAuthConfig({ [variable]: valor })).toThrow(variable);
    }
  });
});
