import type { IdType } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';

export interface FilaDeIdentidad {
  readonly patientId: string;
  readonly idType: IdType;
  readonly issuingCountry: string | null;
  readonly nationalIdCiphertext: Buffer;
  readonly nationalIdHmac: string;
  readonly fullNameCiphertext: Buffer;
  readonly keyVersion: number;
  /** Índice ciego del nombre normalizado; `null` en filas anteriores a la columna hasta que el seed las complete. */
  readonly fullNameHmac: string | null;
}

export interface IdentityRepository {
  /** `true` si insertó; `false` si el paciente ya tenía identidad (no se pisa). */
  insertarSiNoExiste(fila: FilaDeIdentidad): Promise<boolean>;
  buscarPorPaciente(patientId: string): Promise<FilaDeIdentidad | null>;
  /** Escribe el índice del nombre solo donde aún es nulo (idempotente); `true` si lo completó. */
  completarIndiceDeNombre(patientId: string, indiceDeNombre: string): Promise<boolean>;
  /** Pacientes cuyo documento tiene ese índice ciego (sin país emisor: dos países pueden devolver dos filas). */
  buscarPacientesPorDocumento(idType: IdType, indiceDeDocumento: string): Promise<string[]>;
  /** Pacientes cuyo nombre normalizado tiene ese índice ciego (varios pacientes pueden compartirlo). */
  buscarPacientesPorNombre(indiceDeNombre: string): Promise<string[]>;
  /** Las filas de los pacientes pedidos, sin orden; un paciente sin identidad simplemente no aparece. */
  buscarPorPacientes(patientIds: readonly string[]): Promise<FilaDeIdentidad[]>;
}

/** Consulta SQL mínima que necesita el repository (la cumplen `pg.Client`, `pg.Pool` y la sesión del seed). */
export interface ConsultadorSql {
  query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface FilaSql {
  patient_id: string;
  id_type: IdType;
  issuing_country: string | null;
  national_id_ciphertext: Buffer;
  national_id_hmac: string;
  full_name_ciphertext: Buffer;
  key_version: number;
  full_name_hmac: string | null;
}

const COLUMNAS = `patient_id, id_type::text AS id_type, issuing_country, national_id_ciphertext,
                national_id_hmac, full_name_ciphertext, key_version, full_name_hmac`;

function comoFila(fila: FilaSql): FilaDeIdentidad {
  return {
    patientId: fila.patient_id,
    idType: fila.id_type,
    issuingCountry: fila.issuing_country,
    nationalIdCiphertext: fila.national_id_ciphertext,
    nationalIdHmac: fila.national_id_hmac,
    fullNameCiphertext: fila.full_name_ciphertext,
    keyVersion: fila.key_version,
    fullNameHmac: fila.full_name_hmac,
  };
}

export function createIdentityRepository(db: ConsultadorSql): IdentityRepository {
  return {
    async insertarSiNoExiste(fila) {
      const { rows } = await db.query(
        `INSERT INTO identity.patient_identity
           (patient_id, id_type, issuing_country, national_id_ciphertext, national_id_hmac, full_name_ciphertext, key_version, full_name_hmac)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
          fila.fullNameHmac,
        ],
      );
      return rows.length > 0;
    },
    async buscarPorPaciente(patientId) {
      const { rows } = await db.query(
        `SELECT ${COLUMNAS} FROM identity.patient_identity WHERE patient_id = $1`,
        [patientId],
      );
      const fila = rows[0] as FilaSql | undefined;
      return fila === undefined ? null : comoFila(fila);
    },
    async completarIndiceDeNombre(patientId, indiceDeNombre) {
      const { rows } = await db.query(
        `UPDATE identity.patient_identity SET full_name_hmac = $2
          WHERE patient_id = $1 AND full_name_hmac IS NULL
          RETURNING patient_id`,
        [patientId, indiceDeNombre],
      );
      return rows.length > 0;
    },
    async buscarPacientesPorDocumento(idType, indiceDeDocumento) {
      const { rows } = await db.query(
        `SELECT patient_id FROM identity.patient_identity
          WHERE id_type::text = $1 AND national_id_hmac = $2`,
        [idType, indiceDeDocumento],
      );
      return (rows as Pick<FilaSql, 'patient_id'>[]).map((fila) => fila.patient_id);
    },
    async buscarPacientesPorNombre(indiceDeNombre) {
      const { rows } = await db.query(
        'SELECT patient_id FROM identity.patient_identity WHERE full_name_hmac = $1',
        [indiceDeNombre],
      );
      return (rows as Pick<FilaSql, 'patient_id'>[]).map((fila) => fila.patient_id);
    },
    async buscarPorPacientes(patientIds) {
      if (patientIds.length === 0) return [];
      const { rows } = await db.query(
        `SELECT ${COLUMNAS} FROM identity.patient_identity WHERE patient_id = ANY($1::uuid[])`,
        [patientIds],
      );
      return (rows as FilaSql[]).map(comoFila);
    },
  };
}
