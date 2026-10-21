import {
  ConfiguracionInvalidaError,
  leerSecretoDeArchivo,
  type IdentityKeyConfig,
} from '../../config.js';
import type { LeerArchivo } from '../../config/secrets.js';
import {
  BYTES_DE_CLAVE_AES,
  crearAnilloDeClaves,
  type AnilloDeClaves,
} from './anillo-de-claves.js';

export interface ClavesDeIdentidad {
  readonly anillo: AnilloDeClaves;
  readonly claveDeIndice: Buffer;
}

/** Clave de 32 bytes en base64 (el formato de `setup-secrets.sh`); el error nombra la variable, nunca el contenido. */
function leerClave(variable: string, ruta: string, readFile: LeerArchivo): Buffer {
  const clave = Buffer.from(leerSecretoDeArchivo(variable, ruta, readFile), 'base64');
  if (clave.length !== BYTES_DE_CLAVE_AES) {
    throw new ConfiguracionInvalidaError(
      variable,
      `debe contener ${BYTES_DE_CLAVE_AES} bytes en base64`,
    );
  }
  return clave;
}

/** Lee los archivos de clave: la activa, las anteriores (solo para descifrar) y la del índice ciego. */
export function cargarClavesDeIdentidad(
  config: IdentityKeyConfig,
  readFile: LeerArchivo,
): ClavesDeIdentidad {
  const claves = new Map<number, Buffer>([
    [config.keyVersion, leerClave('IDENTITY_AES_KEY_FILE', config.activeKeyFile, readFile)],
  ]);
  for (const [version, ruta] of config.previousKeyFiles) {
    claves.set(version, leerClave(`IDENTITY_AES_KEY_V${version}_FILE`, ruta, readFile));
  }
  const claveDeIndice = leerClave('BLIND_INDEX_HMAC_KEY_FILE', config.hmacKeyFile, readFile);
  if ([...claves.values()].some((clave) => clave.equals(claveDeIndice))) {
    // Claves separadas (ADR-6): comprometer una no debe comprometer la otra.
    throw new ConfiguracionInvalidaError(
      'BLIND_INDEX_HMAC_KEY_FILE',
      'debe ser distinta de las claves AES de la identidad',
    );
  }
  return {
    anillo: crearAnilloDeClaves({ versionActiva: config.keyVersion, claves }),
    claveDeIndice,
  };
}
