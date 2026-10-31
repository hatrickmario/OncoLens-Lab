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
} as const;

export type ConteosDelSeed = Readonly<Record<keyof typeof CONSULTAS_DE_CONTEO, number>>;

export async function contarFilasDelSeed(db: ClienteSql): Promise<ConteosDelSeed> {
  const conteos: Record<string, number> = {};
  for (const [tabla, consulta] of Object.entries(CONSULTAS_DE_CONTEO)) {
    const { rows } = await db.query(consulta);
    conteos[tabla] = (rows[0] as { n: number }).n;
  }
  return conteos as ConteosDelSeed;
}
