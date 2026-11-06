import type { Consultador } from '../auth/auth.repository.js';
import type { OrigenDelPaciente } from '../patients/patients.repository.js';
import type { MarcaDeOptOut, PacienteParaConsentimiento } from './opt-outs.reglas.js';

/**
 * Lecturas del guardia de opt-out. Solo salen `action` y `recorded_at` de la marca y el origen y la presencia del
 * convenio del paciente: la referencia externa y el motivo nunca se leen (RN-10).
 */
export interface OptOutRepository {
  /** Todas las marcas `analisis_ia` del paciente (pocas por paciente; el índice es `(patient_id, opt_out_type, recorded_at DESC)`). */
  marcasDeAnalisisIa(patientId: string): Promise<MarcaDeOptOut[]>;
  /** `null` si el paciente no existe. */
  pacienteParaConsentimiento(patientId: string): Promise<PacienteParaConsentimiento | null>;
}

/** Cómo una ruta que no trae el paciente en el cuerpo llega a él. `null` si el recurso no existe. */
export interface UbicadorDePaciente {
  pacienteDelAnalisis(analysisId: string): Promise<string | null>;
  pacienteDeLaConversacion(conversationId: string): Promise<string | null>;
}

export function createOptOutRepository(db: Consultador): OptOutRepository & UbicadorDePaciente {
  const primerId = async (sql: string, id: string): Promise<string | null> => {
    const { rows } = await db.query(sql, [id]);
    return (rows[0]?.['patient_id'] as string | undefined) ?? null;
  };
  return {
    async marcasDeAnalisisIa(patientId) {
      const { rows } = await db.query(
        `SELECT action::text AS action, recorded_at
           FROM clinical.patient_opt_out
          WHERE patient_id = $1 AND opt_out_type = 'analisis_ia'
          ORDER BY recorded_at DESC`,
        [patientId],
      );
      return rows.map((fila) => ({
        action: fila['action'] as MarcaDeOptOut['action'],
        recordedAt: fila['recorded_at'] as Date,
      }));
    },
    async pacienteParaConsentimiento(patientId) {
      const { rows } = await db.query(
        `SELECT data_origin::text AS data_origin, agreement_reference
           FROM clinical.patient WHERE id = $1`,
        [patientId],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        dataOrigin: fila['data_origin'] as OrigenDelPaciente,
        agreementReference: fila['agreement_reference'] as string | null,
      };
    },
    pacienteDelAnalisis: (analysisId) =>
      primerId('SELECT patient_id FROM clinical.ai_analysis_record WHERE id = $1', analysisId),
    pacienteDeLaConversacion: (conversationId) =>
      primerId('SELECT patient_id FROM clinical.conversation WHERE id = $1', conversationId),
  };
}
