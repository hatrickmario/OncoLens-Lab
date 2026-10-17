import type { Response } from 'express';

export type CodigoDeError =
  'CREDENCIALES_INVALIDAS' | 'CUERPO_INVALIDO' | 'NO_AUTENTICADO' | 'PERMISO_DENEGADO';

const MENSAJES: Record<CodigoDeError, string> = {
  CREDENCIALES_INVALIDAS: 'Las credenciales no son válidas.',
  CUERPO_INVALIDO: 'El cuerpo de la petición no cumple el contrato.',
  NO_AUTENTICADO: 'La sesión no existe o expiró.',
  PERMISO_DENEGADO: 'El rol de la sesión no tiene permiso para esta acción.',
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
