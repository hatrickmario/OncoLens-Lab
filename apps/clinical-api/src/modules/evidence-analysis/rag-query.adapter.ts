import { ragQuery } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Client } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import type { FalloDeRag, RagQueryClient } from './ports.js';

/** Código `error` del cuerpo de un fallo de rag-orchestrator; cualquier otra forma del cuerpo es `null`. */
function codigoDeError(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const { error } = cuerpo as { error?: unknown };
  return typeof error === 'string' ? error : null;
}

/** Sin respuesta HTTP (red caída o llamada abortada): `status` null, y `tiempoAgotado` si venció el plazo local. */
function falloSinRespuesta(signal: AbortSignal | undefined): FalloDeRag {
  return { ok: false, status: null, codigo: null, tiempoAgotado: signal?.aborted === true };
}

/**
 * Puerto `RagQueryClient` sobre el SDK generado de L1D-105 (transporte con JWT de servicio incluido). Del fallo solo
 * sale el estado HTTP y el código `error`, nunca el mensaje ni el cuerpo (pueden traer texto interno): el mapeo a
 * respuestas de clinical-api es `mapearFalloRag()`. Un fallo de red se traduce a `status: null` sin su mensaje (puede
 * traer host o ruta); `tiempoAgotado` distingue el aborto por `RAG_TIMEOUT_MS`.
 */
export function crearRagQueryClient(sdk: Client): RagQueryClient {
  return {
    async consultar(request, opciones) {
      try {
        const resultado = await ragQuery({
          client: sdk,
          body: request,
          headers: {
            // El mismo traceId del cuerpo, en la cabecera: rag-orchestrator lo liga a todas sus líneas de log (NFR-10).
            'X-Trace-Id': request.traceId,
            ...(opciones?.deadline !== undefined && { 'X-Request-Deadline': opciones.deadline }),
          },
          ...(opciones?.signal !== undefined && { signal: opciones.signal }),
        });
        const { response, data, error } = resultado;
        if (response?.ok === true && data !== undefined) return { ok: true, cuerpo: data };
        if (response === undefined) return falloSinRespuesta(opciones?.signal);
        return { ok: false, status: response.status, codigo: codigoDeError(error) };
      } catch {
        return falloSinRespuesta(opciones?.signal);
      }
    },
  };
}
