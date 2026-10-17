import express, { Router, type Express } from 'express';
import type { Registrar } from './infrastructure/logger.js';
import { authController } from './modules/auth/auth.controller.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { createHealthRouter } from './routes/health.js';

/**
 * Dependencias que la raíz de composición (`server.ts`) inyecta en la aplicación. Cada módulo de dominio añade las
 * suyas en su historia; `createApp({})` sigue siendo válido (solo `/health`).
 */
export interface AppDependencies {
  auth?: {
    service: AuthService;
    nuevoTraceId: () => string;
    registrar: Registrar;
  };
}

/** Factory de la aplicación Express: no escucha ningún puerto ni lee el entorno. */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(createHealthRouter());
  if (dependencies.auth !== undefined) {
    const platform = Router();
    platform.use(authController(dependencies.auth));
    app.use('/platform', platform);
  }
  return app;
}
