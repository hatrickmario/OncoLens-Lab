import type { Express } from 'express';
import type { Client } from 'pg';
import type { PatientIdentityReader } from '../../src/modules/evidence-analysis/ports.js';
import { IDENTIDAD_CHAT, abrirConversacion } from './conversacion.js';
import { insertar } from './filas-sinteticas.js';
import { crearPacienteFxT4aA, type MundoDeGateway, type RagSimulado } from './gateway.js';
import { crearAnalisisConEvidencia } from './seguimiento.js';

/**
 * Soporte de FX-T4c-a (US-148): pacientes sintéticos con marcas de `analisis_ia` insertadas con un *builder* sobre
 * `clinical.patient_opt_out`, sin la CLI de US-149 (que no está en el S6). Todo es sintético (RN-13, RN-14).
 */

/** Referencia externa y motivo sintéticos de la marca: no pueden aparecer en ninguna respuesta ni en los logs (RN-10). */
export const REFERENCIA_EXTERNA_DE_LA_MARCA = 'EXT-TEST-0001';
export const MOTIVO_DE_LA_MARCA = 'solicitud_paciente';

/** Instantes de las marcas: crecientes, para que «la más reciente» sea inequívoca sin leer el reloj. */
export const INSTANTE_ANTERIOR = '2026-10-10T09:00:00.000Z';
export const INSTANTE_POSTERIOR = '2026-10-12T09:00:00.000Z';

/** Todo paciente de estas pruebas tiene la identidad sintética de `P-CHAT`: el detector de PII la conoce. */
export const LECTOR_DE_IDENTIDAD_UNICA: PatientIdentityReader = {
  leer: () => Promise.resolve(IDENTIDAD_CHAT),
};

export interface MarcaSembrada {
  tipo?: 'analisis_ia' | 'investigacion';
  accion: 'registrado' | 'revocado';
  instante?: string;
}

/** Inserta una marca firmada por el administrador sembrado. */
export async function registrarMarca(
  mundo: MundoDeGateway,
  patientId: string,
  marca: MarcaSembrada,
): Promise<void> {
  const { rows } = await mundo.cliente.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'admin@test.local'`,
  );
  const adminId = rows[0]?.id ?? '';
  await insertar(mundo.cliente, 'clinical.patient_opt_out', {
    id: mundo.ids(),
    patient_id: patientId,
    opt_out_type: marca.tipo ?? 'analisis_ia',
    action: marca.accion,
    external_reference: REFERENCIA_EXTERNA_DE_LA_MARCA,
    reason_code: MOTIVO_DE_LA_MARCA,
    recorded_by: adminId,
    recorded_at: marca.instante ?? INSTANTE_ANTERIOR,
  });
}

export interface CasoConIA {
  readonly patientId: string;
  /** `AN-PREV`: un análisis `con_evidencia` ya persistido, sobre el que se pregunta en el seguimiento. */
  readonly analysisId: string;
  readonly conversationId: string;
}

/**
 * Paciente FX-T4a-a sin marcas, con un análisis previo y una conversación abierta: lo que P-OPT-IA necesita antes de
 * que el administrador registre el opt-out. Deja el `rag` simulado en cero llamadas.
 */
export async function crearCasoConIA(
  mundo: MundoDeGateway,
  app: Express,
  cookie: string,
  rag: RagSimulado,
): Promise<CasoConIA> {
  const patientId = await crearPacienteFxT4aA(mundo);
  const analisis = await crearAnalisisConEvidencia(app, cookie, rag, patientId);
  const conversationId = await abrirConversacion(app, cookie, patientId);
  rag.reiniciar();
  return { patientId, analysisId: analisis.id, conversationId };
}

/** Convierte al paciente en uno sin convenio (RN-15): `agreement_reference` nulo y el origen indicado. */
export async function dejarSinConvenio(
  cliente: Client,
  patientId: string,
  dataOrigin: 'sintetico' | 'real_anonimizado' | 'real_identificado',
): Promise<void> {
  await cliente.query(
    'UPDATE clinical.patient SET agreement_reference = NULL, data_origin = $2 WHERE id = $1',
    [patientId, dataOrigin],
  );
}

export interface ConteoDeRegistrosDeIA {
  readonly analisis: number;
  readonly seguimientos: number;
  readonly turnosDelChat: number;
}

/** Cuántos registros de IA existen en toda la base: un guardia que deniega no escribe ninguno. */
export async function contarRegistrosDeIA(cliente: Client): Promise<ConteoDeRegistrosDeIA> {
  const { rows } = await cliente.query<ConteoDeRegistrosDeIA>(
    `SELECT (SELECT count(*)::int FROM clinical.ai_analysis_record) AS analisis,
            (SELECT count(*)::int FROM clinical.analysis_follow_up) AS seguimientos,
            (SELECT count(*)::int FROM clinical.conversation_turn) AS "turnosDelChat"`,
  );
  return rows[0] ?? { analisis: 0, seguimientos: 0, turnosDelChat: 0 };
}
