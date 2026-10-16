import type { ServiceTokenSigner } from './service-jwt.js';

export interface RagOrchestratorFetchOptions {
  baseUrl: string;
  signer: ServiceTokenSigner;
  fetch?: typeof globalThis.fetch;
}

export function createRagOrchestratorFetch(_options: RagOrchestratorFetchOptions): typeof globalThis.fetch {
  throw new Error('no implementado');
}
