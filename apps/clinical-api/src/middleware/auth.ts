import type { RequestHandler } from 'express';
import type { Registrar } from '../infrastructure/logger.js';
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
  service: Pick<AuthService, 'resolverSesion'>;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

/** Guard de sesión de `/platform/*` (excepto el login): 401 NO_AUTENTICADO antes del controlador. */
export function requireSession(_dependencias: DependenciasDelGuard): RequestHandler {
  return () => {
    throw new Error('no implementado');
  };
}
