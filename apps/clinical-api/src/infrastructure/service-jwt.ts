import type { CryptoKey } from 'jose';
import type { Clock } from './clock.js';

/** Firmador del JWT de servicio hacia rag-orchestrator (ES256, un token nuevo por request). */
export interface ServiceTokenSigner {
  sign(): Promise<string>;
}

export interface ServiceTokenSignerOptions {
  privateKey: CryptoKey;
  clock: Clock;
  ttlSeconds: number;
}

export function createServiceTokenSigner(_options: ServiceTokenSignerOptions): ServiceTokenSigner {
  throw new Error('no implementado');
}
