import type { Consultador } from '../auth/auth.repository.js';

/** Conexión del pool que se devuelve al terminar (`pg.PoolClient` la cumple). */
export interface ConexionLiberable extends Consultador {
  release(): void;
}

/** Fuente de conexiones: `pg.Pool` la cumple. La transacción necesita UNA conexión, nunca el pool entero. */
export interface FuenteDeConexiones {
  connect(): Promise<ConexionLiberable>;
}

/**
 * Ejecuta `trabajo` en UNA transacción: `BEGIN` y `COMMIT` si termina, `ROLLBACK` si lanza (todo o nada). La conexión
 * siempre vuelve al pool. Lo comparten el registro manual y la corrección con histórico.
 */
export async function ejecutarEnTransaccion<T>(
  fuente: FuenteDeConexiones,
  trabajo: (conexion: Consultador) => Promise<T>,
): Promise<T> {
  const conexion = await fuente.connect();
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
}
