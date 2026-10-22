import type { RequestHandler } from 'express';
import { enviarError } from '../infrastructure/http-errores.js';
import type { Registrar } from '../infrastructure/logger.js';
import { NOMBRE_COOKIE_DE_SESION } from '../modules/auth/auth.schema.js';
import type { AuthService, SesionAutenticada } from '../modules/auth/auth.service.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Sesión autenticada por el guard; ausente en rutas públicas (`POST /platform/auth/login`). */
      sesion?: SesionAutenticada;
    }
  }
}

export interface DependenciasDelGuard {
  service: Pick<AuthService, 'resolverYTocarSesion'>;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

/** Valor de `oncolens_session` en la cabecera `Cookie` (la primera aparición); `undefined` si falta o está vacío. */
export function tokenDeCookie(cabeceraCookie: string | undefined): string | undefined {
  for (const par of (cabeceraCookie ?? '').split(';')) {
    const [nombre, ...resto] = par.trim().split('=');
    if (nombre === NOMBRE_COOKIE_DE_SESION) return resto.join('=') || undefined;
  }
  return undefined;
}

/**
 * Guard de sesión de `/platform/*` (excepto el login): sin cookie, token desconocido, sesión caducada, revocada o
 * cuenta no activa → 401 NO_AUTENTICADO antes del controlador y antes de parsear el cuerpo (AC-3). Con sesión válida
 * adjunta `userId` y `rol`; el 403 por rol lo aplica quien lo necesite (L1D-103).
 */
export function requireSession(dependencias: DependenciasDelGuard): RequestHandler {
  const { service, nuevoTraceId, registrar } = dependencias;
  return async (request, response, next) => {
    const token = tokenDeCookie(request.headers.cookie);
    const sesion = token === undefined ? null : await service.resolverYTocarSesion(token);
    if (sesion === null) {
      const traceId = nuevoTraceId();
      registrar({ event: 'auth.guard', resultado: 'no_autenticado', traceId });
      enviarError(response, 401, 'NO_AUTENTICADO', traceId);
      return;
    }
    request.sesion = sesion;
    next();
  };
}
