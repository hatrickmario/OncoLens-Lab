import type { Router } from 'express';
import type { Client } from 'pg';
import { componerAplicacion } from '../../src/composition.js';
import type { AuthConfig, SesionConfig } from '../../src/config/index.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import type { Consultador } from '../../src/modules/auth/auth.repository.js';
import type { GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { generadorDeIds } from './filas-sinteticas.js';
import { ARGON2_DE_PRUEBA, traceIdsFijos } from './usuarios.js';

export const CONFIG_DE_TEST: AuthConfig = {
  sessionTtlHours: 8,
  argon2: ARGON2_DE_PRUEBA,
};

export const CONFIG_DE_SESION_DE_TEST: SesionConfig = {
  idleMinutes: 30,
  touchSeconds: 60,
  loginMaxFailedAttempts: 5,
  loginLockoutMinutes: 15,
  trustProxyHops: 1,
};

export interface OpcionesAppDeTest {
  /** Sobrescribe campos de `CONFIG_DE_SESION_DE_TEST`. */
  sesion?: Partial<SesionConfig>;
  cliente: Client;
  /** Espacio de ids del archivo de test (los archivos comparten base y corren en paralelo). */
  espacio: number;
  tokens: GeneradorDeToken;
  reloj: Clock;
  registrar: Registrar;
  rutasProtegidas?: readonly Router[];
  /** Sustituye a la conexión de `cliente` (p. ej. una que rechaza, para probar el manejador final de errores). */
  db?: Consultador;
}

/** La aplicación de producción (`componerAplicacion`) con la BD de test y reloj, token, ids y traceId fijos. */
export function appConAuth(opciones: OpcionesAppDeTest) {
  return componerAplicacion({
    db: opciones.db ?? opciones.cliente,
    auth: CONFIG_DE_TEST,
    sesion: { ...CONFIG_DE_SESION_DE_TEST, ...opciones.sesion },
    reloj: opciones.reloj,
    tokens: opciones.tokens,
    ids: generadorDeIds(opciones.espacio + 1000),
    nuevoTraceId: traceIdsFijos(),
    registrar: opciones.registrar,
    ...(opciones.rutasProtegidas !== undefined && { rutasProtegidas: opciones.rutasProtegidas }),
  });
}
