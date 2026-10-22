import type { Consultador } from '../auth/auth.repository.js';

export type EstadoDelPaciente = 'activo' | 'egresado';
export type OrigenDelPaciente = 'sintetico' | 'real_anonimizado' | 'real_identificado';

export interface FiltroDePacientes {
  readonly status?: EstadoDelPaciente | undefined;
  readonly dataOrigin?: OrigenDelPaciente | undefined;
  /** Solo estos pacientes (resultado de una búsqueda por índice ciego); sin valor, todos. */
  readonly ids?: readonly string[] | undefined;
  readonly limit: number;
  readonly offset: number;
}

/** Datos no clínicos de un paciente que alimentan una fila del listado. */
export interface FilaDePaciente {
  readonly id: string;
  readonly dataOrigin: OrigenDelPaciente;
  readonly lifecycleStatus: EstadoDelPaciente;
  readonly birthYear: number;
  readonly registeredAt: Date;
  /** `cancer_type` del diagnóstico activo; `null` si el paciente aún no tiene uno. */
  readonly cancerType: string | null;
}

export interface PaginaDePacientes {
  readonly filas: FilaDePaciente[];
  readonly total: number;
}

export interface PatientsRepository {
  /** Pacientes que cumplen el filtro, del más reciente al más antiguo (desempate por `id`), y cuántos son en total. */
  listar(filtro: FiltroDePacientes): Promise<PaginaDePacientes>;
  /** Datos clínicos por revisar de cada paciente pedido (`requiere_revision`); los que no tienen ninguno no aparecen. */
  contarPendientesDeRevision(patientIds: readonly string[]): Promise<Map<string, number>>;
}

interface FilaSql {
  id: string;
  data_origin: OrigenDelPaciente;
  lifecycle_status: EstadoDelPaciente;
  birth_year: number;
  created_at: Date;
  cancer_type: string | null;
}

/** Cada tabla con revisión de datos, con la consulta que lleva `patient_id` a su paciente. */
const FUENTES_POR_REVISAR = [
  'SELECT patient_id FROM clinical.diagnosis WHERE review_status = $2',
  'SELECT d.patient_id FROM clinical.diagnosis_grading g JOIN clinical.diagnosis d ON d.id = g.diagnosis_id WHERE g.review_status = $2',
  'SELECT patient_id FROM clinical.clinical_note WHERE review_status = $2',
  'SELECT e.patient_id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE b.review_status = $2',
  'SELECT patient_id FROM clinical.prior_treatment WHERE review_status = $2',
  'SELECT patient_id FROM clinical.clinical_event WHERE review_status = $2',
  'SELECT patient_id FROM clinical.clinical_attribute WHERE review_status = $2',
];

const POR_REVISAR = 'requiere_revision';

const DONDE = `
  ($1::text IS NULL OR p.lifecycle_status::text = $1)
  AND ($2::text IS NULL OR p.data_origin::text = $2)
  AND ($3::uuid[] IS NULL OR p.id = ANY($3))`;

export function createPatientsRepository(db: Consultador): PatientsRepository {
  return {
    async listar(filtro) {
      const criterios = [filtro.status ?? null, filtro.dataOrigin ?? null, filtro.ids ?? null];
      const { rows } = await db.query(
        `SELECT p.id, p.data_origin::text AS data_origin, p.lifecycle_status::text AS lifecycle_status,
                p.birth_year, p.created_at,
                (SELECT d.cancer_type FROM clinical.diagnosis d
                  WHERE d.patient_id = p.id AND d.is_active
                  ORDER BY d.diagnosed_at DESC, d.id LIMIT 1) AS cancer_type
           FROM clinical.patient p
          WHERE ${DONDE}
          ORDER BY p.created_at DESC, p.id
          LIMIT $4 OFFSET $5`,
        [...criterios, filtro.limit, filtro.offset],
      );
      const { rows: conteo } = await db.query(
        `SELECT count(*)::int AS total FROM clinical.patient p WHERE ${DONDE}`,
        criterios,
      );
      return {
        filas: (rows as unknown as FilaSql[]).map((fila) => ({
          id: fila.id,
          dataOrigin: fila.data_origin,
          lifecycleStatus: fila.lifecycle_status,
          birthYear: fila.birth_year,
          registeredAt: fila.created_at,
          cancerType: fila.cancer_type,
        })),
        total: Number(conteo[0]?.['total'] ?? 0),
      };
    },
    async contarPendientesDeRevision(patientIds) {
      if (patientIds.length === 0) return new Map();
      const { rows } = await db.query(
        `SELECT patient_id, count(*)::int AS pendientes
           FROM (${FUENTES_POR_REVISAR.join(' UNION ALL ')}) AS por_revisar
          WHERE patient_id = ANY($1::uuid[])
          GROUP BY patient_id`,
        [patientIds, POR_REVISAR],
      );
      return new Map(rows.map((fila) => [String(fila['patient_id']), Number(fila['pendientes'])]));
    },
  };
}
