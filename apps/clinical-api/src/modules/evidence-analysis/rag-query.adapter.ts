import type { Client } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import type { RagQueryClient } from './ports.js';

/** Puerto `RagQueryClient` sobre el SDK generado de L1D-105 (transporte con JWT de servicio incluido). */
export function crearRagQueryClient(_sdk: Client): RagQueryClient {
  return {
    consultar() {
      throw new Error('no implementado');
    },
  };
}
