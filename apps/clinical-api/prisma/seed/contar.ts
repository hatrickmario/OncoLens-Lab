import type { ClienteSql } from './sembrar.js';

/**
 * Verificación del seed de la demo (L1D-297, D4b, privacy P2): SOLO conteos, con el rol de `clinical-api` y dentro de su
 * contenedor. Cada consulta es un `SELECT count(*)` literal: nunca filas, columnas ni identidad. Las claves coinciden con las
 * de `FilasUpsertadas` (lo que publica el propio seed), así `levantar.sh` compara contra el seed y no contra números fijos.
 */
const CONSULTAS_DE_CONTEO = {
  'clinical.patient': 'SELECT count(*)::int AS n FROM clinical.patient',
  'identity.patient_identity': 'SELECT count(*)::int AS n FROM identity.patient_identity',
  'auth."user"': 'SELECT count(*)::int AS n FROM auth."user"',
  'clinical.prior_treatment': 'SELECT count(*)::int AS n FROM clinical.prior_treatment',
  'clinical.clinical_event': 'SELECT count(*)::int AS n FROM clinical.clinical_event',
  'clinical.clinical_attribute': 'SELECT count(*)::int AS n FROM clinical.clinical_attribute',
} as const;

/** Clave aditiva de `contar-en-proceso`: pacientes por `data_origin` (US-142 AC-3; RN-13). */
export const CLAVE_PACIENTES_POR_ORIGEN = 'clinical.patient.por_data_origin';
const ORIGENES_DE_DATOS = ['sintetico', 'real_anonimizado', 'real_identificado'] as const;
const CONSULTA_PACIENTES_POR_ORIGEN =
  'SELECT data_origin::text AS origen, count(*)::int AS n FROM clinical.patient GROUP BY data_origin';

export type ConteoPorOrigen = Readonly<Record<(typeof ORIGENES_DE_DATOS)[number], number>>;

export type ConteosDelSeed = Readonly<Record<keyof typeof CONSULTAS_DE_CONTEO, number>>;

export async function contarFilasDelSeed(db: ClienteSql): Promise<ConteosDelSeed> {
  const conteos: Record<string, number> = {};
  for (const [tabla, consulta] of Object.entries(CONSULTAS_DE_CONTEO)) {
    const { rows } = await db.query(consulta);
    conteos[tabla] = (rows[0] as { n: number }).n;
  }
  return conteos as ConteosDelSeed;
}

/**
 * Pacientes por `data_origin`, solo agregados: la consulta nunca lee una fila ni una columna de identidad. Todo origen sin
 * pacientes cuenta 0, así el gate G-Demo distingue «ninguno no sintético» de «no se pudo contar».
 */
export async function contarPacientesPorOrigen(db: ClienteSql): Promise<ConteoPorOrigen> {
  const conteo: Record<string, number> = Object.fromEntries(ORIGENES_DE_DATOS.map((o) => [o, 0]));
  const { rows } = await db.query(CONSULTA_PACIENTES_POR_ORIGEN);
  for (const fila of rows as { origen: string; n: number }[]) conteo[fila.origen] = fila.n;
  return conteo as ConteoPorOrigen;
}
