import type { Consultador } from '../auth/auth.repository.js';
import { ESTADOS_PENDIENTES_DE_REVISION } from './estados-de-revision.js';

export type EstadoDelPaciente = 'activo' | 'egresado';
export type OrigenDelPaciente = 'sintetico' | 'real_anonimizado' | 'real_identificado';

export interface FiltroDePacientes {
  readonly lifecycleStatus?: EstadoDelPaciente | undefined;
  readonly dataOrigin?: OrigenDelPaciente | undefined;
  /** Solo estos pacientes (resultado de una búsqueda por índice ciego); sin valor, todos. */
  readonly ids?: readonly string[] | undefined;
  /** Solo quien lee datos clínicos recibe el tipo de cáncer del diagnóstico activo; el admin no (mínimo privilegio). */
  readonly conDatosClinicos: boolean;
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

/** Una tabla del esquema `clinical` con `review_status` y la consulta que lleva sus filas a su paciente. */
export interface FuentePorRevisar {
  readonly tabla: string;
  /** `SELECT patient_id …` con el estado de revisión buscado en `$2`. */
  readonly pacienteSql: string;
}

/**
 * Catálogo de las tablas cuyos datos cuentan en `pendingReviewCount`. Una tabla nueva con `review_status` se añade
 * aquí; un test compara este catálogo con `information_schema` para que no se quede fuera sin que falle.
 */
export const FUENTES_POR_REVISAR: readonly FuentePorRevisar[] = [
  {
    tabla: 'diagnosis',
    pacienteSql:
      'SELECT patient_id FROM clinical.diagnosis WHERE review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'diagnosis_grading',
    pacienteSql:
      'SELECT d.patient_id FROM clinical.diagnosis_grading g JOIN clinical.diagnosis d ON d.id = g.diagnosis_id WHERE g.review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'clinical_note',
    pacienteSql:
      'SELECT patient_id FROM clinical.clinical_note WHERE review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'biomarker',
    pacienteSql:
      'SELECT e.patient_id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE b.review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'prior_treatment',
    pacienteSql:
      'SELECT patient_id FROM clinical.prior_treatment WHERE review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'clinical_event',
    pacienteSql:
      'SELECT patient_id FROM clinical.clinical_event WHERE review_status = ANY($2::clinical.review_status[])',
  },
  {
    tabla: 'clinical_attribute',
    pacienteSql:
      'SELECT patient_id FROM clinical.clinical_attribute WHERE review_status = ANY($2::clinical.review_status[])',
  },
];

const SUBCONSULTA_TIPO_DE_CANCER = `(SELECT d.cancer_type FROM clinical.diagnosis d
                  WHERE d.patient_id = p.id AND d.is_active
                  ORDER BY d.diagnosed_at DESC, d.id LIMIT 1)`;

const DONDE = `
  ($1::text IS NULL OR p.lifecycle_status::text = $1)
  AND ($2::text IS NULL OR p.data_origin::text = $2)
  AND ($3::uuid[] IS NULL OR p.id = ANY($3))`;

/** Mapeo explícito columna → campo: el repository no filtra nombres de columna hacia el service. */
function comoFilaDePaciente(fila: FilaSql): FilaDePaciente {
  return {
    id: fila.id,
    dataOrigin: fila.data_origin,
    lifecycleStatus: fila.lifecycle_status,
    birthYear: fila.birth_year,
    registeredAt: fila.created_at,
    cancerType: fila.cancer_type,
  };
}

/** Consulta de la página: orden por alta descendente y `id` como desempate. */
function consultaDeLaPagina(conDatosClinicos: boolean): string {
  return `SELECT p.id, p.data_origin::text AS data_origin, p.lifecycle_status::text AS lifecycle_status,
                p.birth_year, p.created_at,
                ${conDatosClinicos ? SUBCONSULTA_TIPO_DE_CANCER : 'NULL::text'} AS cancer_type
           FROM clinical.patient p
          WHERE ${DONDE}
          ORDER BY p.created_at DESC, p.id
          LIMIT $4 OFFSET $5`;
}

const CONSULTA_DEL_TOTAL = `SELECT count(*)::int AS total FROM clinical.patient p WHERE ${DONDE}`;

const CONSULTA_DE_PENDIENTES = `SELECT patient_id, count(*)::int AS pendientes
           FROM (${FUENTES_POR_REVISAR.map((fuente) => fuente.pacienteSql).join(' UNION ALL ')}) AS por_revisar
          WHERE patient_id = ANY($1::uuid[])
          GROUP BY patient_id`;

export function createPatientsRepository(db: Consultador): PatientsRepository {
  return {
    async listar(filtro) {
      const criterios = [
        filtro.lifecycleStatus ?? null,
        filtro.dataOrigin ?? null,
        filtro.ids ?? null,
      ];
      const { rows } = await db.query(consultaDeLaPagina(filtro.conDatosClinicos), [
        ...criterios,
        filtro.limit,
        filtro.offset,
      ]);
      const { rows: conteo } = await db.query(CONSULTA_DEL_TOTAL, criterios);
      return {
        filas: (rows as unknown as FilaSql[]).map(comoFilaDePaciente),
        total: Number(conteo[0]?.['total'] ?? 0),
      };
    },
    async contarPendientesDeRevision(patientIds) {
      if (patientIds.length === 0) return new Map();
      const { rows } = await db.query(CONSULTA_DE_PENDIENTES, [
        patientIds,
        ESTADOS_PENDIENTES_DE_REVISION,
      ]);
      return new Map(rows.map((fila) => [String(fila['patient_id']), Number(fila['pendientes'])]));
    },
  };
}
