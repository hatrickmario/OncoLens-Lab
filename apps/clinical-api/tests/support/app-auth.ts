import type { Client } from 'pg';
import { createApp } from '../../src/app.js';
import type { AuthConfig } from '../../src/config.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import { createAuthRepository } from '../../src/modules/auth/auth.repository.js';
import { createAuthService, type GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { generadorDeIds } from './filas-sinteticas.js';
import { traceIdsFijos } from './usuarios.js';

export const CONFIG_DE_TEST: AuthConfig = {
  sessionTtlHours: 8,
  argon2: { memoryCostKib: 8, timeCost: 1, parallelism: 1 },
};

export interface OpcionesAppDeTest {
  cliente: Client;
  /** Espacio de ids del archivo de test (los archivos comparten base y corren en paralelo). */
  espacio: number;
  tokens: GeneradorDeToken;
  reloj: Clock;
  registrar: Registrar;
}

/** Aplicación real con el módulo de sesión cableado a la BD de test y a un reloj/token/ids/traceId fijos. */
export function appConAuth(opciones: OpcionesAppDeTest) {
  const service = createAuthService({
    repo: createAuthRepository(opciones.cliente),
    hasher: createPasswordHasher(CONFIG_DE_TEST.argon2),
    tokens: opciones.tokens,
    ids: generadorDeIds(opciones.espacio + 1000),
    reloj: opciones.reloj,
    config: CONFIG_DE_TEST,
  });
  return createApp({
    auth: { service, nuevoTraceId: traceIdsFijos(), registrar: opciones.registrar },
  });
}
