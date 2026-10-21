import express, { Router, type ErrorRequestHandler, type Response } from 'express';
import { authorize } from '../../middleware/authorize.js';
import { tokenDeCookie } from '../../middleware/auth.js';
import { enviarError, esErrorDeCuerpoDelCliente } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { loginSchema, NOMBRE_COOKIE_DE_SESION } from './auth.schema.js';
import { CredencialesInvalidasError, type AuthService } from './auth.service.js';

export interface DependenciasDeAuthController {
  service: AuthService;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

const EVENTO_LOGIN = 'auth.login';
const EVENTO_LOGOUT = 'auth.logout';

/** Cookie opaca de sesión: `HttpOnly; Secure; SameSite=Strict; Path=/`, sin `Domain` (design D6). */
function establecerCookieDeSesion(respuesta: Response, token: string): void {
  respuesta.cookie(NOMBRE_COOKIE_DE_SESION, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
}

/** Borra la cookie con los mismos atributos con los que se emitió (`Max-Age=0`); el navegador la descarta. */
function borrarCookieDeSesion(respuesta: Response): void {
  respuesta.cookie(NOMBRE_COOKIE_DE_SESION, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

/**
 * `POST /auth/login` (se monta bajo `/platform`). Solo traduce HTTP ↔ service. El log lleva únicamente `event`,
 * `resultado` y `traceId`: ni correo, ni contraseña, ni token (NFR-11).
 */
export function authController(dependencias: DependenciasDeAuthController): Router {
  const { service, nuevoTraceId, registrar } = dependencias;
  const router = Router();

  function rechazarCuerpoInvalido(respuesta: Response): void {
    const traceId = nuevoTraceId();
    registrar({ event: EVENTO_LOGIN, resultado: 'cuerpo_invalido', traceId });
    enviarError(respuesta, 422, 'CUERPO_INVALIDO', traceId);
  }

  router.post('/auth/login', express.json(), async (request, response) => {
    const cuerpo = loginSchema.safeParse(request.body);
    if (!cuerpo.success) {
      rechazarCuerpoInvalido(response);
      return;
    }
    const traceId = nuevoTraceId();
    try {
      const { token } = await service.iniciarSesion(cuerpo.data);
      establecerCookieDeSesion(response, token);
      registrar({ event: EVENTO_LOGIN, resultado: 'ok', traceId });
      response.status(204).end();
    } catch (error) {
      if (!(error instanceof CredencialesInvalidasError)) throw error;
      // `motivo` solo acompaña a los bloqueos (valor cerrado, sin correo ni IP); el resto conserva su forma (NFR-11).
      registrar({
        event: EVENTO_LOGIN,
        resultado: 'credenciales_invalidas',
        ...(error.motivo !== 'credenciales' && { motivo: error.motivo }),
        traceId,
      });
      enviarError(response, 401, 'CREDENCIALES_INVALIDAS', traceId);
    }
  });

  // JSON malformado o cuerpo excesivo: mismo 422 del contrato, sin eco del error del parser.
  const cuerpoIlegible: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    rechazarCuerpoInvalido(response);
  };
  router.use(cuerpoIlegible);

  return router;
}

/**
 * `POST /auth/logout` (se monta bajo `/platform`, DESPUÉS del guard): revoca la sesión del token presentado y borra la
 * cookie. Una sesión ausente o ya revocada no llega aquí: el guard responde 401 (idempotencia, design D2).
 */
export function logoutController(dependencias: DependenciasDeAuthController): Router {
  const { service, nuevoTraceId, registrar } = dependencias;
  const router = Router();
  router.post('/auth/logout', authorize('session:logout'), async (request, response) => {
    const token = tokenDeCookie(request.headers.cookie);
    if (token !== undefined) await service.cerrarSesion(token);
    borrarCookieDeSesion(response);
    registrar({ event: EVENTO_LOGOUT, resultado: 'ok', traceId: nuevoTraceId() });
    response.status(204).end();
  });
  return router;
}
