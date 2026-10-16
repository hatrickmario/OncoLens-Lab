const DEFAULT_PORT = 3000;

/** Puerto de escucha desde `PORT` (RN-22: configuración, no literal en el código de arranque). */
export function readPort(env: NodeJS.ProcessEnv): number {
  const raw = env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un puerto TCP válido');
  }
  return port;
}

const DEFAULT_SERVICE_JWT_TTL_SECONDS = 60;

export interface ServiceJwtConfig {
  ttlSeconds: number;
  privateKeyFile: string;
}

/**
 * Configuración del JWT de servicio hacia rag-orchestrator (RN-22: la vida no es un literal del código).
 * Sin `SERVICE_JWT_PRIVATE_KEY_FILE` el arranque falla (fallo cerrado).
 */
export function readServiceJwtConfig(env: NodeJS.ProcessEnv): ServiceJwtConfig {
  const privateKeyFile = env['SERVICE_JWT_PRIVATE_KEY_FILE'];
  if (privateKeyFile === undefined || privateKeyFile === '') {
    throw new Error('SERVICE_JWT_PRIVATE_KEY_FILE no está configurada');
  }
  const rawTtl = env['SERVICE_JWT_TTL_SECONDS'];
  if (rawTtl === undefined || rawTtl === '') {
    return { ttlSeconds: DEFAULT_SERVICE_JWT_TTL_SECONDS, privateKeyFile };
  }
  const ttlSeconds = Number(rawTtl);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('SERVICE_JWT_TTL_SECONDS debe ser un entero positivo');
  }
  return { ttlSeconds, privateKeyFile };
}
