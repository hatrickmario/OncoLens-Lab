import { randomBytes } from 'node:crypto';
import { readIdentityKeyConfig } from '../../config.js';
import type { LeerArchivo } from '../../config/secrets.js';
import { cargarClavesDeIdentidad } from '../../infrastructure/crypto/claves-de-identidad.js';
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

/**
 * Compone el `IdentityService` desde la configuración: lee `IDENTITY_KEY_VERSION`, las claves AES por versión y la clave
 * del índice ciego (todas por archivo). Un fallo de configuración nombra la variable, nunca el valor (RN-10, RN-14).
 */
export function componerIdentidad({
  env,
  readFile,
  db,
  generarNonce = () => randomBytes(BYTES_DE_NONCE),
}: DependenciasDeLaIdentidad): IdentityService {
  const { anillo, claveDeIndice } = cargarClavesDeIdentidad(readIdentityKeyConfig(env), readFile);
  return createIdentityService({
    cifrador: crearCifradorAesGcm({ anillo, generarNonce }),
    indice: crearIndiceCiego(claveDeIndice),
    repo: createIdentityRepository(db),
  });
}
