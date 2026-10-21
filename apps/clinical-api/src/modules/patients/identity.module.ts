import { randomBytes } from 'node:crypto';
import { readIdentityKeyConfig } from '../../config/index.js';
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
