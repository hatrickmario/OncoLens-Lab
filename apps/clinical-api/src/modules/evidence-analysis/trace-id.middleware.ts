import type { RequestHandler } from 'express';
import type { IdGenerator } from './ports.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      /** `traceId` generado por clinical-api para esta petición; el único que viaja a Backend 2 y a la respuesta. */
      traceId?: string;
      /** `X-Trace-Id` entrante, solo si cumple el patrón: va únicamente al log. */
      traceIdEntrante?: string;
    }
  }
}

/** Patrón de `TraceId` del contrato (`^req_[A-Za-z0-9]{8,32}$`). */
const PATRON_DE_TRACE_ID = /^req_[A-Za-z0-9]{8,32}$/;

/** Devuelve el `X-Trace-Id` entrante solo si cumple el patrón del contrato; cualquier otro valor se descarta. */
export function traceIdEntranteRegistrable(valor: string | undefined): string | undefined {
  return valor !== undefined && PATRON_DE_TRACE_ID.test(valor) ? valor : undefined;
}

/**
 * Genera el `traceId` de la petición con el generador inyectado. El `X-Trace-Id` entrante es un dato no confiable:
 * solo se conserva (para el log) si cumple el patrón; nunca llega a Backend 2, a la respuesta ni a la persistencia.
 */
export function crearTraceIdMiddleware(ids: IdGenerator): RequestHandler {
  return (peticion, respuesta, siguiente) => {
    respuesta.locals.traceId = ids.traceId();
    const entrante = traceIdEntranteRegistrable(peticion.header('x-trace-id'));
    if (entrante !== undefined) respuesta.locals.traceIdEntrante = entrante;
    siguiente();
  };
}
