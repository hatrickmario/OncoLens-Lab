import { randomBytes } from 'node:crypto';
import { readIdentityKeyConfig } from '../../config.js';
import type { LeerArchivo } from '../../config/secrets.js';
import {
  cargarClavesDeIdentidad,
  type ClavesDeIdentidad,
} from '../../infrastructure/crypto/claves-de-identidad.js';
import { crearCifradorAesGcm } from '../../infrastructure/crypto/cifrador-aes-gcm.js';
import { crearIndiceCiego } from '../../infrastructure/crypto/indice-ciego.js';
import { createIdentityRepository, type ConsultadorSql } from './identity.repository.js';
import { createIdentityService, type IdentityService } from './identity.service.js';

const BYTES_DE_NONCE = 12;

export interface DependenciasDeLaIdentidad {
  readonly env: NodeJS.ProcessEnv;
  readonly readFile: LeerArchivo;
  readonly db: ConsultadorSql;
  /** 12 bytes aleatorios; solo los tests lo inyectan (por defecto, el generador del sistema). */
  readonly generarNonce?: () => Buffer;
}

/** Lee `IDENTITY_KEY_VERSION`, las claves AES por versión y la del índice ciego (todas por archivo, RN-10, RN-14). */
export function leerClavesDeIdentidadDelEntorno(
  env: NodeJS.ProcessEnv,
  readFile: LeerArchivo,
): ClavesDeIdentidad {
  return cargarClavesDeIdentidad(readIdentityKeyConfig(env), readFile);
}

/** `IdentityService` sobre una conexión (o la sesión de una transacción) con las claves ya leídas. */
export function crearServicioDeIdentidad({
  claves,
  db,
  generarNonce = () => randomBytes(BYTES_DE_NONCE),
}: {
  readonly claves: ClavesDeIdentidad;
  readonly db: ConsultadorSql;
  readonly generarNonce?: () => Buffer;
}): IdentityService {
  return createIdentityService({
    cifrador: crearCifradorAesGcm({ anillo: claves.anillo, generarNonce }),
    indice: crearIndiceCiego(claves.claveDeIndice),
    repo: createIdentityRepository(db),
  });
}

/**
 * Compone el `IdentityService` desde la configuración. Un fallo de configuración nombra la variable, nunca el valor
 * (RN-10, RN-14).
 */
export function componerIdentidad({
  env,
  readFile,
  db,
  generarNonce,
}: DependenciasDeLaIdentidad): IdentityService {
  return crearServicioDeIdentidad({
    claves: leerClavesDeIdentidadDelEntorno(env, readFile),
    db,
    ...(generarNonce !== undefined && { generarNonce }),
  });
}
