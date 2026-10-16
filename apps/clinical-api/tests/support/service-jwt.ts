import { generateKeyPair, type CryptoKey } from 'jose';
import type { Clock } from '../../src/infrastructure/clock.js';

/** Par ES256 efímero en memoria: ninguna clave se versiona (RN-14). */
export async function generarParEfimero(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
  return generateKeyPair('ES256');
}

export const INSTANTE_CONGELADO = new Date('2026-10-16T12:00:00.000Z');

export function relojCongelado(instante: Date = INSTANTE_CONGELADO): Clock {
  return { now: () => instante };
}
