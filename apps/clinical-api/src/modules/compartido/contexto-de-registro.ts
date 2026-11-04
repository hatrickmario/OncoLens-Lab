import type { Consultador } from '../auth/auth.repository.js';
import { sqlDiagnosticoCandidato, sqlOrdenDeDiagnosticoVigente } from './diagnostico-vigente.js';

/*
 * Lo que toda escritura clínica del oncólogo lee del paciente antes de insertar: a qué episodio de atención se asocia
 * el registro y de qué tipo de cáncer es el diagnóstico vigente (contra el que se valida o normaliza, RN-27, RN-29).
 */

/** Episodio al que se asocia un registro nuevo: el abierto, o el más reciente. */
export async function episodioDelRegistro(db: Consultador, patientId: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT id FROM clinical.care_episode WHERE patient_id = $1
      ORDER BY (closed_at IS NULL) DESC, opened_at DESC, id LIMIT 1`,
    [patientId],
  );
  const id = rows[0]?.['id'];
  // Un paciente siempre nace con su episodio: que falte es un dato corrupto, no un error del cliente.
  if (typeof id !== 'string') throw new Error('El paciente no tiene episodio de atención');
  return id;
}

/**
 * Tipo de cáncer del diagnóstico vigente (la misma regla de vigencia que la ficha y el checklist); `null` si el
 * paciente no tiene ninguno.
 */
export async function tipoDeCancerVigente(
  db: Consultador,
  patientId: string,
): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT cancer_type FROM clinical.diagnosis
      WHERE patient_id = $1 AND ${sqlDiagnosticoCandidato()}
      ORDER BY ${sqlOrdenDeDiagnosticoVigente()} LIMIT 1`,
    [patientId],
  );
  const tipo = rows[0]?.['cancer_type'];
  return typeof tipo === 'string' ? tipo : null;
}
