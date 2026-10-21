import type { ErrorRequestHandler, Response } from 'express';
import { IdentityIntegrityError } from './crypto/identity-integrity-error.js';
import type { Registrar } from './logger.js';

/** La sesión no tiene ninguno de los permisos que exige la operación; el manejador final lo traduce a 403. */
export class PermisoDenegadoError extends Error {
  constructor() {
    super('Permiso denegado');
    this.name = 'PermisoDenegadoError';
  }
}

/** `ERROR_INTERNO` es el cuerpo del 500 declarado en `openapi.yaml` (`#/components/responses/ErrorInterno`). */
export type CodigoDeError =
  | 'CREDENCIALES_INVALIDAS'
  | 'CUERPO_INVALIDO'
  | 'NO_AUTENTICADO'
  | 'PERMISO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'TIPO_CANCER_NO_REGISTRADO'
  | 'CATALOG_VERSION_MISMATCH'
  | 'ERROR_SERVICIO_IA'
  | 'LOCAL_LLM_UNAVAILABLE'
  | 'DESIDENTIFICACION_NO_DISPONIBLE'
  | 'DEADLINE_VENCIDO'
  | 'ERROR_INTERNO';

const MENSAJES: Record<CodigoDeError, string> = {
  CREDENCIALES_INVALIDAS: 'Las credenciales no son válidas.',
  CUERPO_INVALIDO: 'El cuerpo de la petición no cumple el contrato.',
  NO_AUTENTICADO: 'La sesión no existe o expiró.',
  PERMISO_DENEGADO: 'El rol de la sesión no tiene permiso para esta acción.',
  NO_ENCONTRADO: 'No existe el recurso solicitado.',
  TIPO_CANCER_NO_REGISTRADO:
    'Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.',
  CATALOG_VERSION_MISMATCH: 'La versión del catálogo clínico difiere entre servicios.',
  ERROR_SERVICIO_IA: 'El servicio de IA no respondió correctamente.',
  LOCAL_LLM_UNAVAILABLE: 'El modelo local no está disponible.',
  DESIDENTIFICACION_NO_DISPONIBLE: 'No fue posible preparar la consulta.',
  DEADLINE_VENCIDO: 'El servicio de IA no respondió dentro del plazo.',
  ERROR_INTERNO: 'Error interno del servidor.',
};

// Errores 4xx de body-parser causados por el cliente → 422 del contrato. Se excluyen a propósito
// `stream.encoding.set` (500: error de configuración del servidor) y `entity.verify.failed` (no se usa `verify`).
const ERRORES_DE_CUERPO: ReadonlySet<string> = new Set([
  'entity.parse.failed',
  'entity.too.large',
  'encoding.unsupported',
  'charset.unsupported',
  'request.size.invalid',
  'request.aborted',
]);

/** `true` solo para los errores del parser de cuerpo (`error.type`) que causa el cliente; cualquier otro sigue al 500. */
export function esErrorDeCuerpoDelCliente(error: unknown): boolean {
  const tipo = (error as { type?: unknown } | null)?.type;
  return typeof tipo === 'string' && ERRORES_DE_CUERPO.has(tipo);
}

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
    if (error instanceof PermisoDenegadoError) {
      const traceId = respuesta.locals.traceId ?? dependencias.nuevoTraceId();
      dependencias.registrar({
        event: 'auth.authorize',
        resultado: 'permiso_denegado',
        traceId,
      });
      enviarError(respuesta, 403, 'PERMISO_DENEGADO', traceId);
      return;
    }
    const traceId = dependencias.nuevoTraceId();
    dependencias.registrar({
      event: 'error.no_controlado',
      ...(error instanceof IdentityIntegrityError && { code: error.code }),
      traceId,
    });
    enviarError(respuesta, 500, 'ERROR_INTERNO', traceId);
  };
}
