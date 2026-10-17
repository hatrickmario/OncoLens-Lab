import type { ErrorRequestHandler, Response } from 'express';
import type { Registrar } from './logger.js';

/**
 * `ERROR_INTERNO` no está declarado en `openapi.yaml` (el spec no define un 500 genérico): pregunta de contrato
 * abierta para el Gate 2 de L1D-197.
 */
export type CodigoDeError =
  | 'CREDENCIALES_INVALIDAS'
  | 'CUERPO_INVALIDO'
  | 'NO_AUTENTICADO'
  | 'PERMISO_DENEGADO'
  | 'ERROR_INTERNO';

const MENSAJES: Record<CodigoDeError, string> = {
  CREDENCIALES_INVALIDAS: 'Las credenciales no son válidas.',
  CUERPO_INVALIDO: 'El cuerpo de la petición no cumple el contrato.',
  NO_AUTENTICADO: 'La sesión no existe o expiró.',
  PERMISO_DENEGADO: 'El rol de la sesión no tiene permiso para esta acción.',
  ERROR_INTERNO: 'Error interno del servidor.',
};

/** Cuerpo de error del contrato `{ error, message, traceId }`: el mensaje es fijo, nunca eco de la entrada. */
export function enviarError(
  respuesta: Response,
  status: number,
  codigo: CodigoDeError,
  traceId: string,
): void {
  respuesta.status(status).json({ error: codigo, message: MENSAJES[codigo], traceId });
}

/**
 * Manejador final de errores: 500 JSON fijo en cualquier `NODE_ENV` (el de Express devuelve HTML con la pila fuera
 * de producción). El log lleva solo `event` y `traceId`: ni `err.message` ni pila, que pueden traer PHI o secretos.
 */
export function manejadorFinalDeErrores(dependencias: {
  nuevoTraceId: () => string;
  registrar: Registrar;
}): ErrorRequestHandler {
  return (error: unknown, _request, respuesta, next) => {
    if (respuesta.headersSent) {
      next(error);
      return;
    }
    const traceId = dependencias.nuevoTraceId();
    dependencias.registrar({ event: 'error.no_controlado', traceId });
    enviarError(respuesta, 500, 'ERROR_INTERNO', traceId);
  };
}
