import type { Client } from '../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import type { ServiceTokenSigner } from './service-jwt.js';

export interface RagOrchestratorClientOptions {
  baseUrl: string;
  signer: ServiceTokenSigner;
  fetch?: typeof globalThis.fetch;
}

export function createRagOrchestratorClient(_options: RagOrchestratorClientOptions): Client {
  throw new Error('no implementado');
}
