import express, { Router, type Express } from 'express';
import type { Registrar } from './infrastructure/logger.js';
import { requireSession } from './middleware/auth.js';
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
  /**
   * Routers de `/platform/*` que exigen sesión (gateway de análisis, pacientes...). Se montan DESPUÉS del guard y
   * antes de cualquier parseo de cuerpo, para que un request sin sesión responda 401 sin llegar al controlador.
   */
  rutasProtegidas?: readonly Router[];
}

/** Factory de la aplicación Express: no escucha ningún puerto ni lee el entorno. */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(createHealthRouter());
  if (dependencies.auth !== undefined) {
    const platform = Router();
    platform.use(authController(dependencies.auth)); // público: el login va antes del guard
    platform.use(requireSession(dependencies.auth));
    for (const ruta of dependencies.rutasProtegidas ?? []) platform.use(ruta);
    app.use('/platform', platform);
  }
  return app;
}
