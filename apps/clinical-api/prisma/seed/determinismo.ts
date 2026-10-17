import { createHash } from 'node:crypto';
import type { Clock } from '../../src/infrastructure/clock.js';

/** Namespace fijo del seed: cambiarlo cambia TODOS los identificadores sembrados (rompería la idempotencia). */
const NAMESPACE_DEL_SEED = '0b7f3c5e-6a41-4d2b-9e18-5c2a8f40d7b3';

const HORA_DEL_RELOJ_UTC = 'T12:00:00.000Z';

function bytesDelUuid(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex');
}

function formatearUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** UUID v5 (RFC 4122 §4.3): SHA-1 de namespace + nombre, con versión 5 y variante RFC 4122. */
export function uuidV5(namespace: string, nombre: string): string {
  const resumen = createHash('sha1')
    .update(bytesDelUuid(namespace))
    .update(nombre, 'utf8')
    .digest()
    .subarray(0, 16);
  resumen[6] = ((resumen[6] ?? 0) & 0x0f) | 0x50;
  resumen[8] = ((resumen[8] ?? 0) & 0x3f) | 0x80;
  return formatearUuid(resumen);
}

/** Reloj del seed: congelado en la fecha de referencia (`SEED_REFERENCE_DATE`); nunca `Date.now()` (CLAUDE.md, TDD). */
export function relojDelSeed(fechaDeReferencia: string): Clock {
  return { now: () => new Date(`${fechaDeReferencia}${HORA_DEL_RELOJ_UTC}`) };
}

/** UUID v5 estable para `claveNatural` (p. ej. `paciente-a/diagnostico-1`): la base de la idempotencia del seed. */
export function idSembrado(claveNatural: string): string {
  return uuidV5(NAMESPACE_DEL_SEED, claveNatural);
}
