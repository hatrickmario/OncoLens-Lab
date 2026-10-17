import type { Clock } from '../../src/infrastructure/clock.js';

/** Reloj del seed: congelado en la fecha de referencia (`SEED_REFERENCE_DATE`); nunca `Date.now()` (CLAUDE.md, TDD). */
export function relojDelSeed(_fechaDeReferencia: string): Clock {
  throw new Error('no implementado');
}

/** UUID v5 estable para `claveNatural` (p. ej. `paciente-a/diagnostico-1`): la base de la idempotencia del seed. */
export function idSembrado(_claveNatural: string): string {
  throw new Error('no implementado');
}
