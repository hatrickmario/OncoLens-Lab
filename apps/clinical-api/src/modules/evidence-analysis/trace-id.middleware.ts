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

/** Devuelve el `X-Trace-Id` entrante solo si cumple el patrón del contrato; cualquier otro valor se descarta. */
export function traceIdEntranteRegistrable(_valor: string | undefined): string | undefined {
  throw new Error('no implementado');
}

export function crearTraceIdMiddleware(_ids: IdGenerator): RequestHandler {
  return () => {
    throw new Error('no implementado');
  };
}
