import pg from 'pg';
import type { DatabaseConfig } from '../config.js';

/**
 * Único pool de PostgreSQL de clinical-api (rol `clinical_api`). TLS siempre con verificación del certificado del
 * servidor contra la CA configurada: `rejectUnauthorized` nunca es `false` (SEG-08).
 */
export function crearPool(config: DatabaseConfig): pg.Pool {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: { ca: config.ca, rejectUnauthorized: true },
  });
  // Un cliente inactivo que falla no debe tumbar el proceso ni volcar el error (puede traer host o usuario).
  pool.on('error', () => {
    console.error(JSON.stringify({ level: 'error', event: 'pool_postgres_error' }));
  });
  return pool;
}
