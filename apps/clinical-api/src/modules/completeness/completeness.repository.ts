import allowlistDelModelo from '../../../../../packages/clinical-catalogs/validator/modelo.allowlist.json' with { type: 'json' };
import type { Consultador } from '../auth/auth.repository.js';
import type {
  RegistroDeDato,
  RegistrosDeCompletitud,
  RegistrosPorEntidad,
  ValorDeColumna,
} from './ports.js';

/**
 * Lectura de los datos críticos del paciente (US-002, design D7): una consulta por entidad de destino, siempre por
 * `patient_id` (UUID). El SQL proyecta SOLO las columnas de la allowlist del modelo (`jsonb_build_object` generado del
 * JSON versionado): `source_span`, `description`, `patient_id`, `reviewed_by`... nunca salen de la base. Nunca lee
 * `identity`, `ClinicalNote` ni texto libre. NO filtra por estado de revisión: el filtro de RN-07 vive en un solo
 * lugar, `registrosVigentes()`.
 */

interface ConsultaDeEntidad {
  /** `FROM` con alias `t` para la entidad y, si hay relación, `e` para su examen. */
  readonly desde: string;
  readonly filtro: string;
  /** Expresión SQL de la fecha de observación o de examen, como `YYYY-MM-DD`; `NULL` si la entidad no tiene. */
  readonly fecha: string;
  /** Relación directa que se aplana con prefijo (`exam.exam_type`). */
  readonly relacion?: {
    readonly alias: string;
    readonly prefijo: string;
    readonly entidad: string;
  };
}

const FECHA = (columna: string) => `to_char(${columna}, 'YYYY-MM-DD')`;

const CONSULTAS: Readonly<Record<string, ConsultaDeEntidad>> = {
  // Solo el diagnóstico activo (design D4): un único registro por paciente.
  Diagnosis: {
    desde: 'clinical.diagnosis t',
    filtro: 't.patient_id = $1 AND t.is_active',
    fecha: 'NULL',
  },
  Biomarker: {
    desde: 'clinical.biomarker t JOIN clinical.exam e ON e.id = t.exam_id',
    filtro: 'e.patient_id = $1',
    fecha: FECHA('e.performed_at'),
    relacion: { alias: 'e', prefijo: 'exam.', entidad: 'Exam' },
  },
  ClinicalAttribute: {
    desde: 'clinical.clinical_attribute t',
    filtro: 't.patient_id = $1',
    fecha: FECHA('t.observed_at'),
  },
  PriorTreatment: {
    desde: 'clinical.prior_treatment t',
    filtro: 't.patient_id = $1',
    fecha: FECHA('t.started_at'),
  },
  ClinicalEvent: {
    desde: 'clinical.clinical_event t',
    filtro: 't.patient_id = $1',
    fecha: FECHA('t.event_date'),
  },
  Exam: { desde: 'clinical.exam t', filtro: 't.patient_id = $1', fecha: FECHA('t.performed_at') },
};

type Allowlist = Readonly<Record<string, { readonly campos: readonly string[] }>>;
const ENTIDADES_PERMITIDAS = (allowlistDelModelo as { entidades: Allowlist }).entidades;

const INSTANTE_ISO = `to_char(t.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const NOMBRE_DE_COLUMNA = /^[a-z][a-z0-9_]*$/;

/** `jsonb_build_object('campo', alias.campo, ...)` de las columnas permitidas; los nombres salen del JSON versionado. */
function proyeccionPermitida(alias: string, entidad: string): string {
  const campos = ENTIDADES_PERMITIDAS[entidad]?.campos ?? [];
  for (const campo of campos) {
    if (!NOMBRE_DE_COLUMNA.test(campo)) throw new Error(`columna_no_permitida ${entidad}`);
  }
  const pares = campos.map((campo) => `'${campo}', ${alias}.${campo}`);
  return `jsonb_build_object(${pares.join(', ')})`;
}

function sqlDeLaEntidad(entidad: string, consulta: ConsultaDeEntidad): string {
  const relacion =
    consulta.relacion === undefined
      ? ''
      : `, ${proyeccionPermitida(consulta.relacion.alias, consulta.relacion.entidad)} AS relacion`;
  return `SELECT t.id, t.review_status, ${consulta.fecha} AS fecha, ${INSTANTE_ISO} AS creado_en,
                 ${proyeccionPermitida('t', entidad)} AS fila${relacion}
            FROM ${consulta.desde}
           WHERE ${consulta.filtro}`;
}

function soloPermitidas(
  fila: Readonly<Record<string, unknown>>,
  campos: readonly string[],
  prefijo: string,
): Record<string, ValorDeColumna> {
  const columnas: Record<string, ValorDeColumna> = {};
  for (const campo of campos) {
    const valor = fila[campo];
    if (valor === undefined) continue;
    columnas[`${prefijo}${campo}`] =
      typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean'
        ? valor
        : null;
  }
  return columnas;
}

function aRegistro(
  fila: Record<string, unknown>,
  entidad: string,
  consulta: ConsultaDeEntidad,
): RegistroDeDato {
  const propios = soloPermitidas(
    fila['fila'] as Record<string, unknown>,
    ENTIDADES_PERMITIDAS[entidad]?.campos ?? [],
    '',
  );
  const relacion = consulta.relacion;
  const deLaRelacion =
    relacion === undefined
      ? {}
      : soloPermitidas(
          fila['relacion'] as Record<string, unknown>,
          ENTIDADES_PERMITIDAS[relacion.entidad]?.campos ?? [],
          relacion.prefijo,
        );
  return {
    id: fila['id'] as string,
    reviewStatus: fila['review_status'] as string,
    fecha: (fila['fecha'] as string | null) ?? null,
    creadoEn: fila['creado_en'] as string,
    columnas: { ...propios, ...deLaRelacion },
  };
}

export function createCompletenessRepository(db: Consultador): RegistrosDeCompletitud {
  return {
    async registrosSinFiltrarPorRevision(patientId, entidades): Promise<RegistrosPorEntidad> {
      const resultado: Record<string, RegistroDeDato[]> = {};
      for (const entidad of new Set(entidades)) {
        const consulta = CONSULTAS[entidad];
        if (consulta === undefined) throw new Error(`entidad_de_destino_no_soportada ${entidad}`);
        const { rows } = await db.query(sqlDeLaEntidad(entidad, consulta), [patientId]);
        resultado[entidad] = rows.map((fila) => aRegistro(fila, entidad, consulta));
      }
      return resultado;
    },
  };
}
