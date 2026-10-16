import express, { type Express } from 'express';
import { createHealthRouter } from './routes/health.js';

/**
 * Dependencias que la raíz de composición (`server.ts`) inyecta en la aplicación.
 * Vacía en US-034: los módulos de dominio (con su repository y sus clientes) las añaden en sus historias.
 */
export type AppDependencies = Record<string, never>;

/** Factory de la aplicación Express: no escucha ningún puerto ni lee el entorno. */
export function createApp(_dependencies: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(createHealthRouter());
  return app;
}
