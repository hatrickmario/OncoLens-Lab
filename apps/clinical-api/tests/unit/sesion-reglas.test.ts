import { describe, expect, it } from 'vitest';
import {
  cuentaBloqueada,
  debeTocarseLaSesion,
  sesionVigente,
} from '../../src/modules/auth/sesion.reglas.js';

const AHORA = new Date('2026-10-16T12:00:00.000Z');

describe('cuentaBloqueada', () => {
  it('devuelve false cuando la cuenta nunca se bloqueó', () => {
    expect(cuentaBloqueada({ lockedUntil: null }, AHORA)).toBe(false);
  });

  it('devuelve true cuando locked_until es posterior al reloj', () => {
    expect(cuentaBloqueada({ lockedUntil: new Date('2026-10-16T12:00:00.001Z') }, AHORA)).toBe(
      true,
    );
  });

  it('devuelve false cuando locked_until coincide exactamente con el reloj', () => {
    expect(cuentaBloqueada({ lockedUntil: new Date(AHORA) }, AHORA)).toBe(false);
  });

  it('devuelve false cuando locked_until ya pasó', () => {
    expect(cuentaBloqueada({ lockedUntil: new Date('2026-10-16T11:59:59.999Z') }, AHORA)).toBe(
      false,
    );
  });
});

const CONFIG = { idleMinutes: 30 };
const haceMinutos = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);
const enMinutos = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000);

describe('sesionVigente', () => {
  it('devuelve true cuando la última actividad fue hace 29 minutos y expires_at no llegó', () => {
    expect(
      sesionVigente({ expiresAt: enMinutos(60), lastSeenAt: haceMinutos(29) }, AHORA, CONFIG),
    ).toBe(true);
  });

  it('devuelve false cuando la última actividad fue hace 31 minutos', () => {
    expect(
      sesionVigente({ expiresAt: enMinutos(60), lastSeenAt: haceMinutos(31) }, AHORA, CONFIG),
    ).toBe(false);
  });

  it('devuelve false cuando la inactividad es exactamente SESSION_IDLE_MINUTES', () => {
    expect(
      sesionVigente({ expiresAt: enMinutos(60), lastSeenAt: haceMinutos(30) }, AHORA, CONFIG),
    ).toBe(false);
  });

  it('devuelve false cuando expires_at coincide exactamente con el reloj aunque la actividad sea reciente', () => {
    expect(
      sesionVigente({ expiresAt: new Date(AHORA), lastSeenAt: haceMinutos(1) }, AHORA, CONFIG),
    ).toBe(false);
  });

  it('respeta una inactividad configurada distinta de 30 minutos', () => {
    expect(
      sesionVigente({ expiresAt: enMinutos(60), lastSeenAt: haceMinutos(11) }, AHORA, {
        idleMinutes: 10,
      }),
    ).toBe(false);
  });
});

describe('debeTocarseLaSesion', () => {
  const CONFIG_TOQUE = { touchSeconds: 60 };

  it('devuelve false cuando la última actividad es más reciente que SESSION_TOUCH_SECONDS', () => {
    expect(
      debeTocarseLaSesion({ lastSeenAt: new Date(AHORA.getTime() - 59_999) }, AHORA, CONFIG_TOQUE),
    ).toBe(false);
  });

  it('devuelve true cuando pasó exactamente SESSION_TOUCH_SECONDS', () => {
    expect(
      debeTocarseLaSesion({ lastSeenAt: new Date(AHORA.getTime() - 60_000) }, AHORA, CONFIG_TOQUE),
    ).toBe(true);
  });
});
