import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from 'pg';
import type { LeerArchivo } from '../../src/config/secrets.js';
import { crearAnilloDeClaves } from '../../src/infrastructure/crypto/anillo-de-claves.js';
import { crearCifradorAesGcm } from '../../src/infrastructure/crypto/cifrador-aes-gcm.js';
import { crearIndiceCiego } from '../../src/infrastructure/crypto/indice-ciego.js';
import { createIdentityRepository } from '../../src/modules/patients/identity.repository.js';
import {
  createIdentityService,
  type IdentityService,
} from '../../src/modules/patients/identity.service.js';

/**
 * Soporte de la identidad cifrada (US-046). FX-T4a-a es SINTÉTICA (RN-13): el documento se arma por partes porque el
 * escáner de PII de la CI no distingue un valor sintético de uno real. Las claves de test se DERIVAN en tiempo de
 * ejecución de una etiqueta: ningún material de clave vive en el repositorio (RN-14).
 */
export const FX_T4A_A = {
  idType: 'cedula_ciudadania',
  numeroDeDocumento: ['123', '4567'].join(''),
  /** Número distinto del AC-2 (`[S2 resp. 11]`). */
  numeroDistinto: ['123', '456'].join(''),
  nombreCompleto: 'Lucía Fernanda Rondón Peña',
  /** Forma normalizada del nombre (sin tildes, en minúsculas) que el arnés de no-fuga también busca. */
  nombreNormalizado: 'lucia fernanda rondon pena',
  nombre: 'Lucía',
  apellido: 'Rondón',
} as const;

export function claveDeTest(etiqueta: string): Buffer {
  return createHash('sha256').update(`oncolens-test|${etiqueta}`).digest();
}

/** Nonces deterministas y distintos (un contador de 12 bytes): el mismo test produce siempre los mismos bytes. */
export function nonceSecuencial(): () => Buffer {
  let n = 0;
  return () => {
    n += 1;
    const nonce = Buffer.alloc(12);
    nonce.writeUInt32BE(n, 8);
    return nonce;
  };
}

export function anilloDeTest(versionActiva = 1, versiones: readonly number[] = [versionActiva]) {
  return crearAnilloDeClaves({
    versionActiva,
    claves: new Map(versiones.map((version) => [version, claveDeTest(`aes-v${version}`)])),
  });
}

export interface ArchivosDeClaves {
  readonly directorio: string;
  readonly rutaAes: (version: number) => string;
  readonly rutaHmac: string;
  readonly limpiar: () => void;
}

/** Archivos temporales con las claves de test en base64 (el formato de `setup-secrets.sh`): una AES por versión y la HMAC. */
export function archivosDeClaves(versiones: readonly number[] = [1]): ArchivosDeClaves {
  const directorio = mkdtempSync(join(tmpdir(), 'identidad-test-'));
  const rutaAes = (version: number) => join(directorio, `identity_aes_key_v${version}`);
  const rutaHmac = join(directorio, 'blind_index_hmac_key');
  for (const version of versiones) {
    writeFileSync(rutaAes(version), `${claveDeTest(`aes-v${version}`).toString('base64')}\n`, {
      mode: 0o600,
    });
  }
  writeFileSync(rutaHmac, `${claveDeTest('hmac').toString('base64')}\n`, { mode: 0o600 });
  return { directorio, rutaAes, rutaHmac, limpiar: () => rmSync(directorio, { recursive: true }) };
}

/**
 * Entorno de un despliegue: la clave de la versión activa va en `IDENTITY_AES_KEY_FILE` y las anteriores, solo para
 * descifrar, en `IDENTITY_AES_KEY_V<n>_FILE` (D3).
 */
export function entornoDeClaves(
  archivos: ArchivosDeClaves,
  versionActiva: number,
  anteriores: readonly number[] = [],
): NodeJS.ProcessEnv {
  return {
    IDENTITY_KEY_VERSION: String(versionActiva),
    IDENTITY_AES_KEY_FILE: archivos.rutaAes(versionActiva),
    BLIND_INDEX_HMAC_KEY_FILE: archivos.rutaHmac,
    ...Object.fromEntries(
      anteriores.map((version) => [`IDENTITY_AES_KEY_V${version}_FILE`, archivos.rutaAes(version)]),
    ),
  };
}

export const leerArchivoDeTest: LeerArchivo = (ruta) => readFileSync(ruta, 'utf8');

export interface OpcionesDeServicio {
  readonly versionActiva?: number;
  readonly versiones?: readonly number[];
}

/** `IdentityService` real (cifrador AES-GCM, índice HMAC y repository sobre PostgreSQL) con claves y nonces de test. */
export function servicioDeIdentidad(
  cliente: Client,
  opciones: OpcionesDeServicio = {},
): IdentityService {
  const versionActiva = opciones.versionActiva ?? 1;
  return createIdentityService({
    cifrador: crearCifradorAesGcm({
      anillo: anilloDeTest(versionActiva, opciones.versiones ?? [versionActiva]),
      generarNonce: nonceSecuencial(),
    }),
    indice: crearIndiceCiego(claveDeTest('hmac')),
    repo: createIdentityRepository(cliente),
  });
}
