import { leerSecretoDeArchivo } from '../config.js';

/** Lector de archivos inyectado: la carga de secretos no hace E/S directa (determinista en test). */
export type LeerArchivo = (ruta: string) => string;

/** El mensaje nombra la variable y nunca un valor (RN-10, RN-14). */
export class SecretoAusenteError extends Error {
  constructor(readonly variable: string) {
    super(`Secreto ausente o vacío: ${variable}`);
    this.name = 'SecretoAusenteError';
  }
}

export function assertSecretPresent(
  variable: string,
  env: NodeJS.ProcessEnv,
  readFile: LeerArchivo,
): string {
  const ruta = env[variable];
  if (!ruta) throw new SecretoAusenteError(variable);
  try {
    return leerSecretoDeArchivo(variable, ruta, readFile);
  } catch {
    // Cualquier fallo (E/S o vacío) se traduce: el mensaje solo nombra la variable, nunca la ruta (RN-10, RN-14).
    throw new SecretoAusenteError(variable);
  }
}

/**
 * Variables `*_FILE` sin las que `clinical-api` no arranca (US-035 AC-5). Es un arreglo de configuración:
 * US-054 añade `SERVICE_JWT_PRIVATE_KEY_FILE` (fallo cerrado sin clave de servicio).
 */
export const SECRETOS_REQUERIDOS: readonly string[] = [
  'IDENTITY_AES_KEY_FILE',
  'BLIND_INDEX_HMAC_KEY_FILE',
  'SERVICE_JWT_PRIVATE_KEY_FILE',
];

/** Lee cada secreto requerido; la primera variable ausente lanza `SecretoAusenteError`. */
export function loadRequiredSecrets(
  env: NodeJS.ProcessEnv,
  readFile: LeerArchivo,
): Readonly<Record<string, string>> {
  const secretos: Record<string, string> = {};
  for (const variable of SECRETOS_REQUERIDOS) {
    secretos[variable] = assertSecretPresent(variable, env, readFile);
  }
  return secretos;
}
