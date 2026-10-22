import type { Express, Router } from 'express';
import type { IdentityService } from '../../src/modules/patients/identity.service.js';
import { componerModuloDePacientes } from '../../src/modules/patients/patients.module.js';
import { crearTiposHabilitados } from '../../src/modules/evidence-analysis/tipos-habilitados.js';
import { appConAuth } from './app-auth.js';
import {
  AHORA,
  TRACE_ID_GENERADO,
  abrirSesion,
  prepararMundoConSeed,
  type MundoDeGateway,
} from './gateway.js';
import { servicioDeIdentidad } from './identidad.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests del listado y la búsqueda de pacientes (L1D-202): la aplicación de producción (login → guard →
 * pacientes) sobre la base sembrada. Las claves de identidad son las de test, las mismas con las que el seed cifró a
 * los cinco pacientes semilla. Todo dato es sintético (RN-13, RN-14).
 */

/** `PATIENTS_PAGE_SIZE` de la configuración de test: con cinco pacientes semilla da dos páginas (US-048 AC-1). */
export const PAGE_SIZE_DE_TEST = 3;

export interface AppDePacientes {
  readonly app: Express;
  readonly rutas: readonly Router[];
  readonly logger: LoggerEnMemoria;
}

export interface OpcionesDePacientes {
  pageSize?: number;
  /** `IdentityService` a usar (p. ej. uno que cuenta los descifrados); por defecto el real con las claves de test. */
  identidad?: IdentityService;
  logger?: LoggerEnMemoria;
}

export function montarPacientes(
  mundo: MundoDeGateway,
  opciones: OpcionesDePacientes = {},
): AppDePacientes {
  const reloj = relojFijo(AHORA);
  const logger = opciones.logger ?? loggerEnMemoria();
  const router = componerModuloDePacientes({
    db: mundo.cliente,
    identidad: opciones.identidad ?? servicioDeIdentidad(mundo.cliente),
    tiposHabilitados: crearTiposHabilitados(['mama', 'prostata'], ['mama', 'prostata']),
    reloj,
    traceIds: { traceId: () => TRACE_ID_GENERADO },
    registrar: logger.registrar,
    config: { pageSize: opciones.pageSize ?? PAGE_SIZE_DE_TEST },
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [router],
  });
  return { app, logger, rutas: [router] };
}

export interface EscenarioDePacientes {
  readonly mundo: MundoDeGateway;
  readonly cookieDoctor: string;
  readonly cookieAdmin: string;
  readonly cerrar: () => Promise<void>;
}

/** Base sembrada y sesiones de `doc1` y `admin`: una por archivo de test. */
export async function iniciarEscenarioDePacientes(
  etiqueta: string,
  espacio: number,
): Promise<EscenarioDePacientes> {
  const mundo = await prepararMundoConSeed(etiqueta, espacio);
  return {
    mundo,
    cookieDoctor: await abrirSesion(
      mundo,
      'doc1@test.local',
      `SINT-cookie-doctor-${etiqueta}-0001`,
    ),
    cookieAdmin: await abrirSesion(mundo, 'admin@test.local', `SINT-cookie-admin-${etiqueta}-0001`),
    cerrar: () => mundo.cerrar(),
  };
}
