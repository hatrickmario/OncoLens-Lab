import {
  answerFollowUp,
  chatTurn,
  ragQuery,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Client } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/client/index.js';
import type {
  ChatTurnPort,
  FalloDeRag,
  OpcionesDeConsultaRag,
  RagFollowUpPort,
  RagQueryClient,
} from './ports.js';

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

interface ResultadoDelSdk<T> {
  response?: Response;
  data?: T;
  error?: unknown;
}

interface PeticionAlSdk {
  traceId: string;
}

/**
 * Llamada común a rag-orchestrator: el mismo `traceId` del cuerpo en `X-Trace-Id` (NFR-10), el plazo en
 * `X-Request-Deadline`, y la traducción única de la respuesta: del fallo solo sale el estado HTTP y el código `error`,
 * nunca el mensaje ni el cuerpo (pueden traer texto interno); un fallo de red es `status: null` sin su mensaje (puede
 * traer host o ruta) y `tiempoAgotado` distingue el aborto por `RAG_TIMEOUT_MS`.
 */
async function llamarARag<Q extends PeticionAlSdk, T>(
  operacion: (opciones: {
    headers: Record<string, string>;
    signal?: AbortSignal;
  }) => PromiseLike<ResultadoDelSdk<T>>,
  request: Q,
  opciones: OpcionesDeConsultaRag | undefined,
): Promise<{ ok: true; cuerpo: T } | FalloDeRag> {
  try {
    const { response, data, error } = await operacion({
      headers: {
        'X-Trace-Id': request.traceId,
        ...(opciones?.deadline !== undefined && { 'X-Request-Deadline': opciones.deadline }),
      },
      ...(opciones?.signal !== undefined && { signal: opciones.signal }),
    });
    if (response?.ok === true && data !== undefined) return { ok: true, cuerpo: data };
    if (response === undefined) return falloSinRespuesta(opciones?.signal);
    return { ok: false, status: response.status, codigo: codigoDeError(error) };
  } catch {
    return falloSinRespuesta(opciones?.signal);
  }
}

/** Puerto `RagQueryClient` sobre el SDK generado de L1D-105 (transporte con JWT de servicio incluido). */
export function crearRagQueryClient(sdk: Client): RagQueryClient {
  return {
    consultar: (request, opciones) =>
      llamarARag(
        (comunes) => ragQuery({ client: sdk, body: request, ...comunes }),
        request,
        opciones,
      ),
  };
}

/** Puerto `RagFollowUpPort` sobre el mismo SDK y la misma traducción de fallos que `crearRagQueryClient`. */
export function crearRagFollowUpClient(sdk: Client): RagFollowUpPort {
  return {
    responder: (request, opciones) =>
      llamarARag(
        (comunes) => answerFollowUp({ client: sdk, body: request, ...comunes }),
        request,
        opciones,
      ),
  };
}

/** Puerto `ChatTurnPort` sobre el mismo SDK y la misma traducción de fallos: el `404 HILO_DESCONOCIDO` llega como `status 404` y `codigo`. */
export function crearRagChatClient(sdk: Client): ChatTurnPort {
  return {
    responder: (request, opciones) =>
      llamarARag(
        (comunes) => chatTurn({ client: sdk, body: request, ...comunes }),
        request,
        opciones,
      ),
  };
}
