import express, { Router, type ErrorRequestHandler } from 'express';
import { enviarError } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { loginSchema, NOMBRE_COOKIE_DE_SESION } from './auth.schema.js';
import { CredencialesInvalidasError, type AuthService } from './auth.service.js';

export interface DependenciasDeAuthController {
  service: AuthService;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

/**
 * `POST /auth/login` (se monta bajo `/platform`). Solo traduce HTTP ↔ service. El log lleva únicamente `event`,
 * `resultado` y `traceId`: ni correo, ni contraseña, ni token (NFR-11).
 */
export function authController(dependencias: DependenciasDeAuthController): Router {
  const { service, nuevoTraceId, registrar } = dependencias;
  const router = Router();

  router.post('/auth/login', express.json(), async (request, response) => {
    const traceId = nuevoTraceId();
    const cuerpo = loginSchema.safeParse(request.body);
    if (!cuerpo.success) {
      registrar({ event: 'auth.login', resultado: 'cuerpo_invalido', traceId });
      enviarError(response, 422, 'CUERPO_INVALIDO', traceId);
      return;
    }
    try {
      const { token } = await service.iniciarSesion(cuerpo.data);
      response.cookie(NOMBRE_COOKIE_DE_SESION, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
      });
      registrar({ event: 'auth.login', resultado: 'ok', traceId });
      response.status(204).end();
    } catch (error) {
      if (!(error instanceof CredencialesInvalidasError)) throw error;
      registrar({ event: 'auth.login', resultado: 'credenciales_invalidas', traceId });
      enviarError(response, 401, 'CREDENCIALES_INVALIDAS', traceId);
    }
  });

  // JSON malformado o cuerpo excesivo: mismo 422 del contrato, sin eco del error del parser.
  const cuerpoIlegible: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    const status = (error as { status?: number }).status;
    if (typeof status !== 'number' || status < 400 || status >= 500) {
      next(error);
      return;
    }
    const traceId = nuevoTraceId();
    registrar({ event: 'auth.login', resultado: 'cuerpo_invalido', traceId });
    enviarError(response, 422, 'CUERPO_INVALIDO', traceId);
  };
  router.use(cuerpoIlegible);

  return router;
}
