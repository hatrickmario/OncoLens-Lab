import type { Consultador } from '../auth/auth.repository.js';
import type { RepositorioDeRegistroManual } from './ports.js';

/** Conexión del pool que se devuelve al terminar (`pg.PoolClient` la cumple). */
export interface ConexionLiberable extends Consultador {
  release(): void;
}

/** Fuente de conexiones: `pg.Pool` la cumple. La transacción necesita UNA conexión, nunca el pool entero. */
export interface FuenteDeConexiones {
  connect(): Promise<ConexionLiberable>;
}

export function createManualEntryRepository(fuente: FuenteDeConexiones): RepositorioDeRegistroManual {
  void fuente;
  return {
    enTransaccion() {
      return Promise.reject(new Error('no implementado'));
    },
  };
}
