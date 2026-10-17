import { readDatabaseConfig } from '../../src/config.js';
import type { LeerArchivo } from '../../src/config/secrets.js';
import { crearPool } from '../../src/infrastructure/database.js';
import type { Registrar } from '../../src/infrastructure/logger.js';
import type { ClienteSql, ConexionDelSeed } from './sembrar.js';

/** Envuelve un cliente de `pg` en la conexión del seed: transacción única y liberación (`alCerrar`). */
export function conexionDesdeCliente(
  _cliente: ClienteSql,
  _alCerrar: () => Promise<void>,
): ConexionDelSeed {
  throw new Error('no implementado');
}

/**
 * Conexión del seed a PostgreSQL con el mismo camino que `clinical-api`: `CLINICAL_DATABASE_URL` SIN credenciales, la
 * contraseña de `PG_CLINICAL_API_PASSWORD_FILE` (solo en memoria) y TLS verificando la CA del servidor (SEG-08, RN-14).
 */
export async function conectarConTlsVerificado(
  env: NodeJS.ProcessEnv,
  leerArchivo: LeerArchivo,
  registrar: Registrar,
): Promise<ConexionDelSeed> {
  const pool = crearPool(readDatabaseConfig(env, leerArchivo), registrar);
  try {
    const cliente = await pool.connect();
    return conexionDesdeCliente(cliente, async () => {
      cliente.release();
      await pool.end();
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
}
