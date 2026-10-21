import express, { Router, type Express } from 'express';
import { manejadorFinalDeErrores } from './infrastructure/http-errores.js';
import type { Registrar } from './infrastructure/logger.js';
import { requireSession } from './middleware/auth.js';
import { authController } from './modules/auth/auth.controller.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { createHealthRouter, type InformacionDeSalud } from './routes/health.js';

export interface DependenciasDeAuth {
  service: AuthService;
  nuevoTraceId: () => string;
  registrar: Registrar;
}

/**
 * Dependencias que la raíz de composición (`server.ts`) inyecta en la aplicación. Cada módulo de dominio añade las
 * suyas en su historia; `createApp({})` sigue siendo válido (solo `/health`).
 */
export interface AppDependencies {
  /** Saltos de proxy de confianza para `req.ip` (`TRUST_PROXY_HOPS`); sin valor, Express no confía en ninguna cabecera. */
  trustProxyHops?: number;
  /** Nombres de las claves de configuración cargadas y versión del servicio para `/health` (US-037); nunca valores. */
  salud?: InformacionDeSalud;
  /**
   * `/platform/*`: el módulo de autenticación y los routers que exigen sesión. Van juntos a propósito: no se pueden
   * montar `rutasProtegidas` sin el guard. Se montan DESPUÉS de él (gateway de análisis, pacientes...).
   */
  plataforma?: {
    auth: DependenciasDeAuth;
    rutasProtegidas?: readonly Router[];
  };
}

/** Factory de la aplicación Express: no escucha ningún puerto ni lee el entorno. */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  if (dependencies.trustProxyHops !== undefined)
    app.set('trust proxy', dependencies.trustProxyHops);
  app.use(createHealthRouter(dependencies.salud));
  const { plataforma } = dependencies;
  if (plataforma !== undefined) {
    const router = Router();
    router.use(authController(plataforma.auth)); // público: el login va antes del guard
    router.use(requireSession(plataforma.auth));
    for (const ruta of plataforma.rutasProtegidas ?? []) router.use(ruta);
    app.use('/platform', router);
    app.use(manejadorFinalDeErrores(plataforma.auth));
  }
  return app;
}
