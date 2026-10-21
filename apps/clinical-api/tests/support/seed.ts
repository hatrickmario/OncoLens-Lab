import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import { conexionDesdeCliente } from '../../prisma/seed/conexion.js';
import { ejecutarSeed } from '../../prisma/seed/principal.js';
import type { ConexionDelSeed, FilasUpsertadas } from '../../prisma/seed/sembrar.js';
import {
  createPasswordHasher,
  type PasswordHasher,
} from '../../src/modules/auth/password-hasher.js';
import { tablasDelCatalogo } from './catalogo.js';
import { conectar, crearBaseDeTest, leerConfiguracionArnes, type BaseDeTest } from './db.js';
import { archivosDeClaves, entornoDeClaves, type ArchivosDeClaves } from './identidad.js';
import { ARGON2_DE_PRUEBA, loggerEnMemoria, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests del seed (US-039). Cada archivo de test crea SU base: el seed y los conteos de "todas las tablas"
 * no pueden compartir base con los archivos que corren en paralelo. Las contraseñas SINT-* son ficticias y viven solo
 * aquí, en tests/ (decisión 66 del plan, RN-14): el código del seed no define ninguna.
 */

const RAIZ_APP = resolve(fileURLToPath(new URL('../..', import.meta.url)));
/** Catálogo del monorepo, el que lee el seed por defecto (`CLINICAL_CATALOG_PATH`). */
export const RUTA_DEL_CATALOGO = resolve(RAIZ_APP, '../../packages/clinical-catalogs');

export const CONTRASENA_FICTICIA_DOCTOR = 'SINT-doctor-demo-seed-0001';
export const CONTRASENA_FICTICIA_ADMIN = 'SINT-admin-demo-seed-0001';

/** Base migrada propia del archivo; el sufijo lleva el pid (sin aleatoriedad propia) para no chocar con restos. */
export async function crearBaseDelSeed(etiqueta: string): Promise<BaseDeTest> {
  return crearBaseDeTest(leerConfiguracionArnes(process.env), `seed_${etiqueta}_${process.pid}`);
}

/** Filas por tabla de los cinco schemas clínicos (AC-3 y AC-5 comparan antes y después). */
export async function contarFilasDeTodasLasTablas(
  cliente: Client,
): Promise<Record<string, number>> {
  const conteos: Record<string, number> = {};
  for (const tabla of await tablasDelCatalogo(cliente)) {
    const { rows } = await cliente.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla}`);
    conteos[tabla] = rows[0]?.n ?? 0;
  }
  return conteos;
}

export interface ArchivosDeContrasena {
  readonly directorio: string;
  readonly doctor: string;
  readonly admin: string;
  /** Claves de la identidad cifrada (`IDENTITY_AES_KEY_FILE`, `BLIND_INDEX_HMAC_KEY_FILE`): US-046. */
  readonly claves: ArchivosDeClaves;
  readonly limpiar: () => void;
}

/** Archivos temporales con las contraseñas y las claves de identidad ficticias (lo que Compose monta como `*_FILE` en `clinical-seed`). */
export function escribirArchivosDeContrasena(
  contrasenas: { doctor: string; admin: string } = {
    doctor: CONTRASENA_FICTICIA_DOCTOR,
    admin: CONTRASENA_FICTICIA_ADMIN,
  },
): ArchivosDeContrasena {
  const directorio = mkdtempSync(join(tmpdir(), 'seed-test-'));
  const doctor = join(directorio, 'seed_doctor_password');
  const admin = join(directorio, 'seed_admin_password');
  writeFileSync(doctor, `${contrasenas.doctor}\n`, { mode: 0o600 });
  writeFileSync(admin, `${contrasenas.admin}\n`, { mode: 0o600 });
  const claves = archivosDeClaves();
  return {
    directorio,
    doctor,
    admin,
    claves,
    limpiar: () => {
      claves.limpiar();
      rmSync(directorio, { recursive: true });
    },
  };
}

/** Entorno de un seed permitido (`APP_ENV=test`) con contraseñas por archivo; `extra` lo sobrescribe. */
export function entornoDelSeed(
  archivos: ArchivosDeContrasena,
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'test',
    SEED_DOCTOR_PASSWORD_FILE: archivos.doctor,
    SEED_ADMIN_PASSWORD_FILE: archivos.admin,
    ...entornoDeClaves(archivos.claves, 1),
    ...extra,
  };
}

export interface ResultadoDelSeedEnProceso {
  readonly codigo: number | null;
  readonly salida: string;
}

/**
 * Ejecuta `npx prisma db seed` como proceso con un entorno CERRADO (solo PATH/HOME + `env`): no hereda `APP_ENV` ni
 * `REAL_*` del que lanza la suite. Los casos que llegan aquí abortan antes de abrir la base.
 */
export function ejecutarSeedComoProceso(env: Record<string, string>): ResultadoDelSeedEnProceso {
  const resultado = spawnSync('npx', ['--no-install', 'prisma', 'db', 'seed'], {
    cwd: RAIZ_APP,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    encoding: 'utf8',
  });
  return { codigo: resultado.status, salida: `${resultado.stdout}\n${resultado.stderr}` };
}

export const TRACE_ID_DE_PRUEBA = 'req_seed0001';

export interface SeedEnProceso {
  readonly registro: LoggerEnMemoria;
  readonly ejecutar: (env: NodeJS.ProcessEnv) => Promise<FilasUpsertadas>;
}

/**
 * Corre el seed en el proceso de test contra `urlDeLaBase` (Argon2id con costes de prueba, logger capturable). La
 * transacción es la de producción (`conexionDesdeCliente`); `hasher` permite inyectar uno que falle a mitad.
 */
export function seedContraLaBase(
  urlDeLaBase: string,
  hasher: PasswordHasher = createPasswordHasher(ARGON2_DE_PRUEBA),
): SeedEnProceso {
  const registro = loggerEnMemoria();
  return {
    registro,
    ejecutar: (env) =>
      ejecutarSeed(env, {
        conectar: async (): Promise<ConexionDelSeed> => {
          const cliente = await conectar(urlDeLaBase);
          return conexionDesdeCliente(cliente, () => cliente.end());
        },
        leerArchivo: (ruta) => readFileSync(ruta, 'utf8'),
        hasher,
        registrar: registro.registrar,
        traceId: TRACE_ID_DE_PRUEBA,
      }),
  };
}
