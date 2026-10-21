export interface FilaDeIdentidad {
  readonly patientId: string;
  readonly idType: string;
  readonly issuingCountry: string | null;
  readonly nationalIdCiphertext: Buffer;
  readonly nationalIdHmac: string;
  readonly fullNameCiphertext: Buffer;
  readonly keyVersion: number;
}

export interface IdentityRepository {
  /** `true` si insertó; `false` si el paciente ya tenía identidad (no se pisa). */
  insertarSiNoExiste(fila: FilaDeIdentidad): Promise<boolean>;
  buscarPorPaciente(patientId: string): Promise<FilaDeIdentidad | null>;
}

/** Consulta SQL mínima que necesita el repository (la cumplen `pg.Client`, `pg.Pool` y la sesión del seed). */
export interface ConsultadorSql {
  query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
}

export function createIdentityRepository(_db: ConsultadorSql): IdentityRepository {
  throw new Error('no implementado');
}
