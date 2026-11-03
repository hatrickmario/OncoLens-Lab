import pg from 'pg';
import type { DatabaseConfig } from '../config/index.js';
import type { Registrar } from './logger.js';

/** Lo mínimo que una transacción le entrega al trabajo: la misma forma que `Consultador` de los repositories. */
export interface ConsultaSql {
  query(sql: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Único pool de PostgreSQL de clinical-api (rol `clinical_api`). TLS siempre con verificación del certificado del
 * servidor contra la CA configurada: `rejectUnauthorized` nunca es `false` (SEG-08).
 */
export function crearPool(config: DatabaseConfig, registrar: Registrar): pg.Pool {
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
    registrar({ event: 'pool_postgres_error' });
  });
  return pool;
}

/**
 * Transacción sobre UNA conexión del pool (`BEGIN`/`COMMIT`; `ROLLBACK` ante el fallo): las operaciones que bloquean filas
 * y escriben (p. ej. el turno de seguimiento bajo `SELECT … FOR UPDATE`) no pueden repartirse entre conexiones.
 */
export function crearEjecutorDeTransacciones(pool: pg.Pool) {
  return async <T>(trabajo: (tx: ConsultaSql) => Promise<T>): Promise<T> => {
    const conexion = await pool.connect();
    try {
      await conexion.query('BEGIN');
      const resultado = await trabajo(conexion);
      await conexion.query('COMMIT');
      return resultado;
    } catch (error) {
      await conexion.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      conexion.release();
    }
  };
}
