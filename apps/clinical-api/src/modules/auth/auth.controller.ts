import { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { AuthService } from './auth.service.js';

export interface DependenciasDeAuthController {
  service: AuthService;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

/** `POST /auth/login` (se monta bajo `/platform`). */
export function authController(_dependencias: DependenciasDeAuthController): Router {
  const router = Router();
  router.post('/auth/login', () => {
    throw new Error('no implementado');
  });
  return router;
}
