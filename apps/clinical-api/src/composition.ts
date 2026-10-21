import type { Express, Router } from 'express';
import { createApp } from './app.js';
import type { AuthConfig } from './config/index.js';
import type { Clock } from './infrastructure/clock.js';
import type { GeneradorDeIds } from './infrastructure/ids.js';
import type { Registrar } from './infrastructure/logger.js';
import { createAuthRepository, type Consultador } from './modules/auth/auth.repository.js';
import { createAuthService, type GeneradorDeToken } from './modules/auth/auth.service.js';
import { createPasswordHasher } from './modules/auth/password-hasher.js';

export interface DependenciasDeComposicion {
  db: Consultador;
  auth: AuthConfig;
  reloj: Clock;
  tokens: GeneradorDeToken;
  ids: GeneradorDeIds;
  nuevoTraceId: () => string;
  registrar: Registrar;
  /** Routers que exigen sesión (gateway de análisis, pacientes...): se montan después del guard. */
  rutasProtegidas?: readonly Router[];
}

/**
 * Raíz de composición del módulo de sesión: el repository recibe la conexión, el service recibe sus puertos y la
 * aplicación monta login → guard → resto (design D5, D11). No lee el entorno: lo hace `server.ts`.
 */
export function componerAplicacion(dependencias: DependenciasDeComposicion): Express {
  const service = createAuthService({
    repo: createAuthRepository(dependencias.db),
    hasher: createPasswordHasher(dependencias.auth.argon2),
    tokens: dependencias.tokens,
    ids: dependencias.ids,
    reloj: dependencias.reloj,
    config: dependencias.auth,
  });
  return createApp({
    plataforma: {
      auth: {
        service,
        nuevoTraceId: dependencias.nuevoTraceId,
        registrar: dependencias.registrar,
      },
      ...(dependencias.rutasProtegidas !== undefined && {
        rutasProtegidas: dependencias.rutasProtegidas,
      }),
    },
  });
}
