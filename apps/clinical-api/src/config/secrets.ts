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
  let contenido: string;
  try {
    contenido = readFile(ruta).trim();
  } catch {
    // El error de E/S trae la ruta: se descarta y solo se nombra la variable.
    throw new SecretoAusenteError(variable);
  }
  if (contenido === '') throw new SecretoAusenteError(variable);
  return contenido;
}

/**
 * Variables `*_FILE` sin las que `clinical-api` no arranca (US-035 AC-5). Es un arreglo de configuración:
 * US-054 le añade `SERVICE_JWT_PRIVATE_KEY_FILE`.
 */
export const SECRETOS_REQUERIDOS: readonly string[] = [
  'IDENTITY_AES_KEY_FILE',
  'BLIND_INDEX_HMAC_KEY_FILE',
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
