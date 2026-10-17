import { v5 } from 'uuid';
import type { Clock } from '../../src/infrastructure/clock.js';

/** Namespace fijo del seed: cambiarlo cambia TODOS los identificadores sembrados (rompería la idempotencia). */
const NAMESPACE_DEL_SEED = '0b7f3c5e-6a41-4d2b-9e18-5c2a8f40d7b3';

const HORA_DEL_RELOJ_UTC = 'T12:00:00.000Z';

/** Reloj del seed: congelado en la fecha de referencia (`SEED_REFERENCE_DATE`); nunca `Date.now()` (CLAUDE.md, TDD). */
export function relojDelSeed(fechaDeReferencia: string): Clock {
  return { now: () => new Date(`${fechaDeReferencia}${HORA_DEL_RELOJ_UTC}`) };
}

/** UUID v5 estable para `claveNatural` (p. ej. `paciente-a/diagnostico-1`): la base de la idempotencia del seed. */
export function idSembrado(claveNatural: string): string {
  return v5(claveNatural, NAMESPACE_DEL_SEED);
}
