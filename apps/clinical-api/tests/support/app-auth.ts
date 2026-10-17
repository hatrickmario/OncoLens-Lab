import type { Router } from 'express';
import type { Client } from 'pg';
import { createApp } from '../../src/app.js';
import type { AuthConfig } from '../../src/config.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import {
  createAuthRepository,
  type AuthRepository,
} from '../../src/modules/auth/auth.repository.js';
import { createAuthService, type GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { generadorDeIds } from './filas-sinteticas.js';
import { ARGON2_DE_PRUEBA, traceIdsFijos } from './usuarios.js';

export const CONFIG_DE_TEST: AuthConfig = {
  sessionTtlHours: 8,
  argon2: ARGON2_DE_PRUEBA,
};

export interface OpcionesAppDeTest {
  cliente: Client;
  /** Espacio de ids del archivo de test (los archivos comparten base y corren en paralelo). */
  espacio: number;
  tokens: GeneradorDeToken;
  reloj: Clock;
  registrar: Registrar;
  rutasProtegidas?: readonly Router[];
  /** Sustituye al repository sobre PostgreSQL (p. ej. uno que lanza, para probar el manejador final de errores). */
  repo?: AuthRepository;
}

/** Aplicación real con el módulo de sesión cableado a la BD de test y a un reloj/token/ids/traceId fijos. */
export function appConAuth(opciones: OpcionesAppDeTest) {
  const service = createAuthService({
    repo: opciones.repo ?? createAuthRepository(opciones.cliente),
    hasher: createPasswordHasher(CONFIG_DE_TEST.argon2),
    tokens: opciones.tokens,
    ids: generadorDeIds(opciones.espacio + 1000),
    reloj: opciones.reloj,
    config: CONFIG_DE_TEST,
  });
  return createApp({
    plataforma: {
      auth: { service, nuevoTraceId: traceIdsFijos(), registrar: opciones.registrar },
      ...(opciones.rutasProtegidas !== undefined && { rutasProtegidas: opciones.rutasProtegidas }),
    },
  });
}
