import { describe, expect, it } from 'vitest';
import {
  EntornoNoSintetico,
  exigirEntornoSintetico,
} from '../../../src/modules/evidence-analysis/deidentification/entorno-sintetico.guard.js';

function rechazoDe(accion: () => void): EntornoNoSintetico {
  try {
    accion();
  } catch (error) {
    if (error instanceof EntornoNoSintetico) return error;
    throw error;
  }
  throw new Error('debía rechazar y no lo hizo');
}

describe('La guarda de entorno sintético se conserva hasta G-Piloto · exigirEntornoSintetico', () => {
  it.each(['local', 'test'])('deja pasar un caso sintético cuando APP_ENV es %s', (appEnv) => {
    expect(() => exigirEntornoSintetico('sintetico', appEnv)).not.toThrow();
  });

  it.each(['real_anonimizado', 'real_identificado'] as const)(
    'rechaza con motivo data_origin cuando el origen es %s',
    (origen) => {
      expect(rechazoDe(() => exigirEntornoSintetico(origen, 'test')).motivo).toBe('data_origin');
    },
  );

  it.each([['piloto'], [''], [undefined]])(
    'rechaza con motivo app_env cuando APP_ENV es %j',
    (appEnv) => {
      expect(rechazoDe(() => exigirEntornoSintetico('sintetico', appEnv)).motivo).toBe('app_env');
    },
  );

  it('informa data_origin antes que app_env cuando fallan ambos', () => {
    expect(rechazoDe(() => exigirEntornoSintetico('real_anonimizado', 'piloto')).motivo).toBe(
      'data_origin',
    );
  });
});
