import { ragQuery } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Client } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import type { RagQueryClient } from './ports.js';

/**
 * Puerto `RagQueryClient` sobre el SDK generado de L1D-105 (transporte con JWT de servicio incluido). Un fallo de red
 * o de transporte se traduce a `{ ok: false, status: null }` sin su mensaje (puede traer host o ruta); el mapeo de
 * errores del contrato a respuestas HTTP es de L1D-104.
 */
export function crearRagQueryClient(sdk: Client): RagQueryClient {
  return {
    async consultar(request, opciones) {
      try {
        const resultado = await ragQuery({
          client: sdk,
          body: request,
          ...(opciones?.deadline !== undefined && {
            headers: { 'X-Request-Deadline': opciones.deadline },
          }),
        });
        const { response, data } = resultado;
        if (response?.ok === true && data !== undefined) return { ok: true, cuerpo: data };
        return { ok: false, status: response?.status ?? null };
      } catch {
        return { ok: false, status: null };
      }
    },
  };
}
