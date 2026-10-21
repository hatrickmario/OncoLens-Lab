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

interface FilaSql {
  patient_id: string;
  id_type: string;
  issuing_country: string | null;
  national_id_ciphertext: Buffer;
  national_id_hmac: string;
  full_name_ciphertext: Buffer;
  key_version: number;
}

export function createIdentityRepository(db: ConsultadorSql): IdentityRepository {
  return {
    async insertarSiNoExiste(fila) {
      const { rows } = await db.query(
        `INSERT INTO identity.patient_identity
           (patient_id, id_type, issuing_country, national_id_ciphertext, national_id_hmac, full_name_ciphertext, key_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (patient_id) DO NOTHING
         RETURNING patient_id`,
        [
          fila.patientId,
          fila.idType,
          fila.issuingCountry,
          fila.nationalIdCiphertext,
          fila.nationalIdHmac,
          fila.fullNameCiphertext,
          fila.keyVersion,
        ],
      );
      return rows.length > 0;
    },
    async buscarPorPaciente(patientId) {
      const { rows } = await db.query(
        `SELECT patient_id, id_type::text AS id_type, issuing_country, national_id_ciphertext,
                national_id_hmac, full_name_ciphertext, key_version
           FROM identity.patient_identity WHERE patient_id = $1`,
        [patientId],
      );
      const fila = rows[0] as FilaSql | undefined;
      if (fila === undefined) return null;
      return {
        patientId: fila.patient_id,
        idType: fila.id_type,
        issuingCountry: fila.issuing_country,
        nationalIdCiphertext: fila.national_id_ciphertext,
        nationalIdHmac: fila.national_id_hmac,
        fullNameCiphertext: fila.full_name_ciphertext,
        keyVersion: fila.key_version,
      };
    },
  };
}
