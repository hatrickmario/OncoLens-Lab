import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readSesionConfig } from '../../src/config/index.js';

function capturar(accion: () => unknown): ConfiguracionInvalidaError {
  try {
    accion();
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error;
    throw error;
  }
  throw new Error('no lanzó ConfiguracionInvalidaError');
}

describe('readSesionConfig', () => {
  it('usa los valores por defecto del diseño cuando no hay variables', () => {
    expect(readSesionConfig({})).toEqual({
      idleMinutes: 30,
      touchSeconds: 60,
      loginMaxFailedAttempts: 5,
      loginLockoutMinutes: 15,
      trustProxyHops: 1,
    });
  });

  it('lee las claves de sesión y de bloqueo del entorno', () => {
    expect(
      readSesionConfig({
        SESSION_IDLE_MINUTES: '10',
        SESSION_TOUCH_SECONDS: '30',
        LOGIN_MAX_FAILED_ATTEMPTS: '3',
        LOGIN_LOCKOUT_MINUTES: '20',
        TRUST_PROXY_HOPS: '2',
      }),
    ).toEqual({
      idleMinutes: 10,
      touchSeconds: 30,
      loginMaxFailedAttempts: 3,
      loginLockoutMinutes: 20,
      trustProxyHops: 2,
    });
  });

  it.each([
    'SESSION_TOUCH_SECONDS',
    'LOGIN_MAX_FAILED_ATTEMPTS',
    'LOGIN_LOCKOUT_MINUTES',
    'TRUST_PROXY_HOPS',
  ])('rechaza %s cuando no es un entero positivo, nombrando la variable', (variable) => {
    for (const valor of ['0', '-1', '1.5', 'abc']) {
      expect(capturar(() => readSesionConfig({ [variable]: valor })).variable).toBe(variable);
    }
  });

  it('rechaza SESSION_TOUCH_SECONDS cuando alcanza la inactividad en segundos, sin eco del valor', () => {
    const error = capturar(() =>
      readSesionConfig({ SESSION_IDLE_MINUTES: '1', SESSION_TOUCH_SECONDS: '60' }),
    );
    expect(error.variable).toBe('SESSION_TOUCH_SECONDS');
    expect(error.message).not.toMatch(/\b60\b/);
  });

  it('acepta SESSION_TOUCH_SECONDS justo por debajo de la inactividad en segundos', () => {
    expect(
      readSesionConfig({ SESSION_IDLE_MINUTES: '1', SESSION_TOUCH_SECONDS: '59' }).touchSeconds,
    ).toBe(59);
  });
});
