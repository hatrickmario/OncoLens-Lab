import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readDeidentificationConfig } from '../../src/config.js';

const ENV_VALIDO = {
  PII_FORMATS_PATH: '/config/pii-formats.json',
  PII_MASKS_PATH: '/app/apps/clinical-api/config/pii-masks.json',
};

function variableInvalida(env: NodeJS.ProcessEnv): string {
  try {
    readDeidentificationConfig(env);
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error.variable;
    throw error;
  }
  throw new Error('la configuración debía ser inválida');
}

describe('readDeidentificationConfig', () => {
  it('lee las dos rutas y aplica 3 como longitud mínima de un token de nombre cuando no se configura', () => {
    expect(readDeidentificationConfig(ENV_VALIDO)).toEqual({
      formatsPath: '/config/pii-formats.json',
      masksPath: '/app/apps/clinical-api/config/pii-masks.json',
      nameTokenMinLength: 3,
    });
  });

  it('lee PII_NAME_TOKEN_MIN_LENGTH del entorno y trata la variable vacía como ausente', () => {
    expect(
      readDeidentificationConfig({ ...ENV_VALIDO, PII_NAME_TOKEN_MIN_LENGTH: '4' })
        .nameTokenMinLength,
    ).toBe(4);
    expect(
      readDeidentificationConfig({ ...ENV_VALIDO, PII_NAME_TOKEN_MIN_LENGTH: '' })
        .nameTokenMinLength,
    ).toBe(3);
  });

  it.each([
    ['PII_FORMATS_PATH', { ...ENV_VALIDO, PII_FORMATS_PATH: undefined }],
    ['PII_MASKS_PATH', { ...ENV_VALIDO, PII_MASKS_PATH: '' }],
    ['PII_NAME_TOKEN_MIN_LENGTH', { ...ENV_VALIDO, PII_NAME_TOKEN_MIN_LENGTH: '0' }],
  ])('nombra %s cuando la configuración es inválida', (variable, env) => {
    expect(variableInvalida(env)).toBe(variable);
  });
});
