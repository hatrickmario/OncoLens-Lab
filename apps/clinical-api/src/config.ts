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

export interface Argon2Config {
  memoryCostKib: number;
  timeCost: number;
  parallelism: number;
}

/** Configuración de sesión y de hash de contraseñas (RN-22: calibrable, no literal del dominio). */
export interface AuthConfig {
  sessionTtlHours: number;
  argon2: Argon2Config;
}

const DEFAULT_SESSION_TTL_HOURS = 8;
// Mínimo recomendado por OWASP para Argon2id; calibrable por entorno (la CI puede bajarlos).
const DEFAULT_ARGON2_MEMORY_COST_KIB = 19456;
const DEFAULT_ARGON2_TIME_COST = 2;
const DEFAULT_ARGON2_PARALLELISM = 1;

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

/** TTL absoluto de la sesión y parámetros de Argon2id (RN-22: configuración, nunca literales del dominio). */
export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    sessionTtlHours: readPositiveInteger(env, 'SESSION_TTL_HOURS', DEFAULT_SESSION_TTL_HOURS),
    argon2: {
      memoryCostKib: readPositiveInteger(
        env,
        'ARGON2_MEMORY_COST_KIB',
        DEFAULT_ARGON2_MEMORY_COST_KIB,
      ),
      timeCost: readPositiveInteger(env, 'ARGON2_TIME_COST', DEFAULT_ARGON2_TIME_COST),
      parallelism: readPositiveInteger(env, 'ARGON2_PARALLELISM', DEFAULT_ARGON2_PARALLELISM),
    },
  };
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
