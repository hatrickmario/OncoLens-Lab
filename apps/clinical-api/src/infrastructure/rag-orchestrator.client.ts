import {
  createClient,
  type Client,
} from '../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import { createRagOrchestratorFetch } from './rag-orchestrator.http.js';
import type { ServiceTokenSigner } from './service-jwt.js';

export interface RagOrchestratorClientOptions {
  baseUrl: string;
  signer: ServiceTokenSigner;
  fetch?: typeof globalThis.fetch;
}

/**
 * Única forma de llamar a rag-orchestrator desde clinical-api: SDK generado del contrato con el `fetch`
 * que firma el JWT de servicio. El deadline lo pasa el servicio llamador como cabecera de la operación;
 * el transporte no lo calcula.
 */
export function createRagOrchestratorClient(options: RagOrchestratorClientOptions): Client {
  const { baseUrl, signer } = options;
  const ragFetch = createRagOrchestratorFetch({
    baseUrl,
    signer,
    ...(options.fetch !== undefined && { fetch: options.fetch }),
  });
  return createClient({ baseUrl, fetch: ragFetch });
}
