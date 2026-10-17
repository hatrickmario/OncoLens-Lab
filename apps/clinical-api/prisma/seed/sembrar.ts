import type { Clock } from '../../src/infrastructure/clock.js';
import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import type { CatalogoClinico } from './catalogo.js';

/** Lo mínimo que el seed necesita de PostgreSQL: `pg.Client`/`PoolClient` cumplen, y el test pasa el cliente real. */
export interface ClienteSql {
  query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/** Conexión de escritura del seed; `end()` la libera. */
export interface ConexionDelSeed extends ClienteSql {
  end(): Promise<void>;
}

export interface CredencialesDelSeed {
  readonly doctor: string;
  readonly admin: string;
}

export interface PoliticaDeRetencion {
  readonly anosHastaRetencion: number;
  readonly anosHastaRetencionMaxima: number;
}

export interface EntradasDelSeed {
  readonly catalogo: CatalogoClinico;
  readonly reloj: Clock;
  readonly hasher: PasswordHasher;
  readonly credenciales: CredencialesDelSeed;
  readonly retencion: PoliticaDeRetencion;
}

/** Filas por tabla tras sembrar (los logs del seed solo llevan conteos, nunca valores). */
export type ResumenDelSeed = Readonly<Record<string, number>>;

/** Siembra roles, usuarios de demo y los pacientes (a)–(e) en UNA transacción, de forma idempotente. */
export function sembrar(_db: ClienteSql, _entradas: EntradasDelSeed): Promise<ResumenDelSeed> {
  return Promise.reject(new Error('no implementado'));
}
