import type { ErrorRequestHandler, Response } from 'express';
import {
  enviarError,
  esErrorDeCuerpoDelCliente,
  type CodigoDeError,
} from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { traceIdDe } from '../../middleware/trace-id.middleware.js';
import { DesidentificacionNoDisponible } from './deidentification/context-deidentifier.js';
import { EntornoNoSintetico } from './deidentification/entorno-sintetico.guard.js';

/** Respuesta de error de los controllers del módulo: estado, código del contrato, etiqueta de log (sin PHI) y extras. */
export interface Rechazo {
  status: number;
  codigo: CodigoDeError;
  resultado: string;
  extra?: LineaDeLog;
}

export const CUERPO_INVALIDO: Rechazo = {
  status: 422,
  codigo: 'CUERPO_INVALIDO',
  resultado: 'cuerpo_invalido',
};
export const ERROR_INTERNO: Rechazo = {
  status: 500,
  codigo: 'ERROR_INTERNO',
  resultado: 'error_de_persistencia',
};
export const DESIDENTIFICACION_NO_DISPONIBLE: Rechazo = {
  status: 503,
  codigo: 'DESIDENTIFICACION_NO_DISPONIBLE',
  resultado: 'desidentificacion_no_disponible',
};
export const ERROR_SERVICIO_IA: Rechazo = {
  status: 502,
  codigo: 'ERROR_SERVICIO_IA',
  resultado: 'error_servicio_ia',
};

/**
 * Única traducción de los errores de desidentificación (RN-11, RN-12) a HTTP: si no pudo garantizarse, `503` sin llamar a
 * la IA; si el entorno no admite datos no sintéticos, `502` con el motivo (sin PHI). `undefined` si no es uno de ellos.
 */
export function rechazoDeDesidentificacion(error: unknown): Rechazo | undefined {
  if (error instanceof DesidentificacionNoDisponible) return DESIDENTIFICACION_NO_DISPONIBLE;
  if (error instanceof EntornoNoSintetico) {
    return {
      ...ERROR_SERVICIO_IA,
      resultado: 'desidentificacion_rechazada',
      extra: { motivo: error.motivo },
    };
  }
  return undefined;
}

/**
 * Emisor de resultados de un controller: el log lleva solo evento, resultado, `traceId`, `traceIdEntrante` (si cumple el
 * patrón) y lo que el llamador añada (UUID, códigos); nunca la pregunta, el contexto ni identidad (RN-10, RN-11).
 */
export function crearEmisor(registrar: Registrar, evento: string) {
  const registrarResultado = (response: Response, resultado: string, extra: LineaDeLog = {}) => {
    const { traceIdEntrante } = response.locals;
    registrar({
      event: evento,
      resultado,
      traceId: traceIdDe(response),
      ...(traceIdEntrante !== undefined && { traceIdEntrante }),
      ...extra,
    });
  };
  return {
    registrarResultado,
    rechazar(response: Response, rechazo: Rechazo, extra: LineaDeLog = {}): void {
      registrarResultado(response, rechazo.resultado, { ...extra, ...rechazo.extra });
      enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
    },
  };
}

export type Emisor = ReturnType<typeof crearEmisor>;

/** JSON malformado o cuerpo excesivo: mismo 422 del contrato, sin eco del error del parser. */
export function manejadorDeCuerpoIlegible(emisor: Emisor): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    emisor.rechazar(response, CUERPO_INVALIDO);
  };
}
