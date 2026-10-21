import { describe, expect, it } from 'vitest';
import { cuentaBloqueada } from '../../src/modules/auth/sesion.reglas.js';

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
