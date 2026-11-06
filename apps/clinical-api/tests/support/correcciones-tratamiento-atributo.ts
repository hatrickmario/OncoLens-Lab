import type { Client } from 'pg';
import type { FuenteDeConexiones } from '../../src/modules/compartido/transaccion.js';
import { conectar } from './db.js';
import {
  nuevoPaciente,
  sembrarAtributo,
  sembrarDiagnostico,
  sembrarTratamientoPrevio,
  type PacienteSembrado,
} from './completitud.js';
import type { EscenarioDeCorrecciones } from './correcciones.js';
import { montarRegistroClinico } from './registro-clinico.js';
import { clienteVerificado } from './verificarProveedor.js';

/**
 * Soporte de los tests de la corrección de tratamientos previos y atributos clínicos (d5fb-05): los datos de partida se
 * registran por los endpoints REALES del registro manual (l1d-80) para que las filas sean las que produce producción.
 * Todo dato es sintético (RN-13, RN-14).
 */

export const TRATAMIENTO_AC_T = {
  lineNumber: 1,
  setting: 'adyuvante',
  regimenName: 'AC-T',
  startedAt: '2026-03-10',
  endedAt: '2026-07-14',
  ongoing: false,
  endReason: 'completado',
} as const;

export const LEUPRORELINA = {
  lineNumber: 2,
  setting: 'segunda_linea_metastasica',
  regimenName: 'Leuprorelina',
  startedAt: '2026-08-01',
  ongoing: true,
} as const;

export const ATRIBUTO_MENOPAUSIA = {
  attributeKey: 'estado_menopausico',
  value: 'posmenopausica',
  observedAt: '2026-09-01',
} as const;

export const DECLARACION_DE_AUSENCIA = {
  attributeKey: 'sin_tratamiento_previo',
  value: 'si',
  observedAt: '2026-11-05',
} as const;

/** Paciente de mama en estadio IV, sin tratamientos ni atributos. */
export async function mamaSinRegistros(
  escenario: EscenarioDeCorrecciones,
): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(escenario.siembra);
  await sembrarDiagnostico(paciente, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: '2',
    stagingSystem: 'TNM_8',
    stageValue: 'IV',
    performanceValue: 1,
  });
  return paciente;
}

/** Paciente de próstata en estadio IV, sin tratamientos ni atributos. */
export async function prostataSinRegistros(
  escenario: EscenarioDeCorrecciones,
): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(escenario.siembra);
  await sembrarDiagnostico(paciente, {
    cancerType: 'prostata',
    histology: 'adenocarcinoma acinar',
    grade: '4+3',
    stagingSystem: 'TNM_8',
    stageValue: 'IV',
    performanceValue: 1,
  });
  return paciente;
}

/** Mama con un tratamiento y un atributo SIN verificar sembrados (la corrección los deja verificados). */
export async function mamaConDatosSinVerificar(
  escenario: EscenarioDeCorrecciones,
): Promise<PacienteSembrado> {
  const paciente = await mamaSinRegistros(escenario);
  await sembrarTratamientoPrevio(paciente, { regimen: 'AC-T', reviewStatus: 'requiere_revision' });
  await sembrarAtributo(paciente, {
    key: 'estado_menopausico',
    value: 'posmenopausica',
    reviewStatus: 'requiere_revision',
  });
  return paciente;
}

export async function pasarAEgresado(cliente: Client, patientId: string): Promise<void> {
  await cliente.query("UPDATE clinical.patient SET lifecycle_status = 'egresado' WHERE id = $1", [
    patientId,
  ]);
}

async function registrar(
  escenario: EscenarioDeCorrecciones,
  ruta: string,
  cuerpo: object,
): Promise<string> {
  const { app } = montarRegistroClinico(escenario.mundo);
  const respuesta = await clienteVerificado(app)
    .post(ruta)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo);
  if (respuesta.status !== 201) throw new Error('no se pudo registrar el dato sintético');
  return respuesta.body.id as string;
}

export const registrarTratamiento = (
  escenario: EscenarioDeCorrecciones,
  patientId: string,
  cuerpo: object = TRATAMIENTO_AC_T,
): Promise<string> =>
  registrar(escenario, `/platform/patients/${patientId}/prior-treatments`, cuerpo);

export const registrarAtributo = (
  escenario: EscenarioDeCorrecciones,
  patientId: string,
  cuerpo: object = ATRIBUTO_MENOPAUSIA,
): Promise<string> =>
  registrar(escenario, `/platform/patients/${patientId}/clinical-attributes`, cuerpo);

/** La vista de caso por el endpoint real: tratamientos, atributos y checklist tal como los ve el doctor. */
export async function vistaDeCaso(escenario: EscenarioDeCorrecciones, patientId: string) {
  const { app } = montarRegistroClinico(escenario.mundo);
  const respuesta = await clienteVerificado(app)
    .get(`/platform/patients/${patientId}/case`)
    .set('Cookie', escenario.cookieDoctor);
  if (respuesta.status !== 200) throw new Error('no se pudo leer la vista de caso sintética');
  return respuesta.body as {
    priorTreatments: { id: string; supersedesId?: string | null; regimenName: string }[];
    attributes: { id: string; supersedesId?: string | null; key: string; value: string }[];
    completeness: { item: string; status: string }[];
  };
}

export interface FilaDeTratamientoGuardada {
  readonly id: string;
  readonly regimen_name: string;
  readonly atc_codes: string[];
  readonly mapping_status: string;
  readonly review_status: string;
  readonly entry_method: string;
  readonly supersedes_id: string | null;
  readonly line_number: number | null;
  readonly setting: string;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly ongoing: boolean;
  readonly end_reason: string;
}

export async function filaDeTratamiento(
  cliente: Client,
  id: string,
): Promise<FilaDeTratamientoGuardada> {
  const { rows } = await cliente.query<FilaDeTratamientoGuardada>(
    `SELECT id, regimen_name, atc_codes, mapping_status::text AS mapping_status,
            review_status::text AS review_status, entry_method::text AS entry_method, supersedes_id, line_number,
            setting, to_char(started_at, 'YYYY-MM-DD') AS started_at, to_char(ended_at, 'YYYY-MM-DD') AS ended_at,
            ongoing, end_reason::text AS end_reason
       FROM clinical.prior_treatment WHERE id = $1`,
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) throw new Error('el tratamiento sintético no existe');
  return fila;
}

export interface FilaDeAtributoGuardada {
  readonly id: string;
  readonly attribute_key: string;
  readonly value: string;
  readonly observed_at: string | null;
  readonly date_precision: string;
  readonly review_status: string;
  readonly entry_method: string;
  readonly supersedes_id: string | null;
}

export async function filaDeAtributo(cliente: Client, id: string): Promise<FilaDeAtributoGuardada> {
  const { rows } = await cliente.query<FilaDeAtributoGuardada>(
    `SELECT id, attribute_key, value, to_char(observed_at, 'YYYY-MM-DD') AS observed_at,
            date_precision::text AS date_precision, review_status::text AS review_status,
            entry_method::text AS entry_method, supersedes_id
       FROM clinical.clinical_attribute WHERE id = $1`,
    [id],
  );
  const fila = rows[0];
  if (fila === undefined) throw new Error('el atributo sintético no existe');
  return fila;
}

/** Filas de tratamientos y atributos del paciente (cualquier estado): «no crea filas» compara antes y después. */
export async function contarTratamientosYAtributos(
  cliente: Client,
  patientId: string,
): Promise<{ tratamientos: number; atributos: number }> {
  const { rows } = await cliente.query<{ tratamientos: number; atributos: number }>(
    `SELECT (SELECT count(*) FROM clinical.prior_treatment WHERE patient_id = $1)::int AS tratamientos,
            (SELECT count(*) FROM clinical.clinical_attribute WHERE patient_id = $1)::int AS atributos`,
    [patientId],
  );
  return rows[0] ?? { tratamientos: 0, atributos: 0 };
}

/** Estados de revisión de las declaraciones de ausencia del paciente, de la más antigua a la más nueva. */
export async function estadosDeLasDeclaraciones(
  cliente: Client,
  patientId: string,
): Promise<string[]> {
  const { rows } = await cliente.query<{ review_status: string }>(
    `SELECT review_status::text AS review_status FROM clinical.clinical_attribute
      WHERE patient_id = $1 AND attribute_key = 'sin_tratamiento_previo' ORDER BY created_at, id`,
    [patientId],
  );
  return rows.map((fila) => fila.review_status);
}

/** Cada transacción abre su PROPIA conexión (como el Pool de producción): para probar el bloqueo entre peticiones. */
export function fuenteIndependiente(escenario: EscenarioDeCorrecciones): FuenteDeConexiones {
  return {
    connect: async () => {
      const cliente = await conectar(escenario.mundo.base.url);
      return {
        query: (sql, valores) => cliente.query(sql, valores),
        release: () => void cliente.end(),
      };
    },
  };
}
