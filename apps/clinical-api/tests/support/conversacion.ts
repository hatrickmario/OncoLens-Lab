import type { Express } from 'express';
import type { Client } from 'pg';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../prisma/seed/pacientes/chat.js';
import { INSTANTE_FIJO, insertar } from './filas-sinteticas.js';
import type { MundoDeGateway } from './gateway.js';
import { clienteVerificado } from './verificarProveedor.js';

/**
 * Soporte de la conversación del chat (L1D-315): abre conversaciones por la API real, siembra turnos ya persistidos
 * y lee las filas. La PII del chat es la SINTÉTICA de `P-CHAT` (FX-12-b): nada es de una persona real (RN-13, RN-14).
 */

/** Identidad sintética de `P-CHAT` tal como la conoce el detector de PII (ADR-40). */
export const IDENTIDAD_CHAT = {
  nombreCompleto: NOMBRE_SINTETICO_CHAT,
  documento: DOCUMENTO_SINTETICO_CHAT,
} as const;

/** FX-12-d: pregunta con nombre, documento y fecha de nacimiento sintéticos de `P-CHAT`. */
export const PREGUNTA_FX_12_D = `La paciente ${NOMBRE_SINTETICO_CHAT}, ${DOCUMENTO_SINTETICO_CHAT}, nacida el ${NACIMIENTO_SINTETICO_CHAT}, ¿cuál es su situación actual?`;

export const PREGUNTA_DE_CASO = '¿Cuál es la situación actual de la paciente?';

export const rutaDeTurnos = (conversationId: string): string =>
  `/platform/conversations/${conversationId}/turns`;

export const rutaDeConversacion = (conversationId: string): string =>
  `/platform/conversations/${conversationId}`;

export const rutaDeApertura = (patientId: string): string =>
  `/platform/patients/${patientId}/conversations`;

/** Abre una conversación por la API real (verificada contra el spec) y devuelve su id. */
export async function abrirConversacion(
  app: Express,
  cookie: string,
  patientId: string,
): Promise<string> {
  const respuesta = await clienteVerificado(app)
    .post(rutaDeApertura(patientId))
    .set('Cookie', cookie);
  if (respuesta.status !== 201)
    throw new Error(`abrir la conversación respondió ${respuesta.status}`);
  return (respuesta.body as { conversationId: string }).conversationId;
}

export async function enviarTurno(
  app: Express,
  cookie: string,
  conversationId: string,
  question: string,
) {
  return clienteVerificado(app)
    .post(rutaDeTurnos(conversationId))
    .set('Cookie', cookie)
    .send({ question });
}

export interface FilaDeTurnoDeChat {
  id: string;
  conversation_id: string;
  turn_number: number;
  question_masked: string;
  intent: string;
  blocks: { kind: string; text: string; factRefs?: string[] }[];
  data_links: { factRef: string; resourceId: string }[];
  omitted_claims: number;
  notices: string[];
  data_used: string[];
  data_missing: string[];
  analysis_id: string | null;
  structured_state: Record<string, unknown>;
  llm_provider: string;
  trace_id: string;
}

export async function leerTurnosDeChat(
  cliente: Client,
  conversationId: string,
): Promise<FilaDeTurnoDeChat[]> {
  const { rows } = await cliente.query<FilaDeTurnoDeChat>(
    'SELECT * FROM clinical.conversation_turn WHERE conversation_id = $1 ORDER BY turn_number',
    [conversationId],
  );
  return rows;
}

export async function contarTurnosDeChat(cliente: Client, conversationId: string): Promise<number> {
  return (await leerTurnosDeChat(cliente, conversationId)).length;
}

/** Toda fila de la conversación y de sus turnos como texto: las columnas se revisan juntas contra lo que no puede persistirse. */
export async function textoDeLaConversacion(
  cliente: Client,
  conversationId: string,
): Promise<string> {
  const conversacion = await cliente.query('SELECT * FROM clinical.conversation WHERE id = $1', [
    conversationId,
  ]);
  const turnos = await cliente.query(
    'SELECT * FROM clinical.conversation_turn WHERE conversation_id = $1',
    [conversationId],
  );
  return JSON.stringify([conversacion.rows, turnos.rows]);
}

export interface TurnoSembrado {
  turnNumber: number;
  question: string;
  intent?: string;
  blocks?: object[];
  dataLinks?: object[];
  analysisId?: string | null;
  structuredState?: object;
}

export const ESTADO_ESTRUCTURADO_VACIO = {
  intentsVistos: [],
  preguntasPrevias: [],
  opcionesMostradas: [],
  citasMostradas: [],
  faltantesSenalados: [],
} as const;

/** Inserta un turno ya persistido con la huella mínima válida (los ids salen del generador de turnos del mundo). */
export async function sembrarTurnoDeChat(
  mundo: MundoDeGateway,
  conversationId: string,
  turno: TurnoSembrado,
): Promise<string> {
  const fila = await insertar(mundo.cliente, 'clinical.conversation_turn', {
    id: mundo.idsDeTurnosDeChat(),
    conversation_id: conversationId,
    turn_number: turno.turnNumber,
    question_masked: turno.question,
    intent: turno.intent ?? 'caso',
    about_turn_id: null,
    blocks: JSON.stringify(turno.blocks ?? []),
    data_links: JSON.stringify(turno.dataLinks ?? []),
    omitted_claims: 0,
    notices: JSON.stringify([]),
    data_used: JSON.stringify([]),
    data_missing: JSON.stringify([]),
    analysis_id: turno.analysisId ?? null,
    structured_state: JSON.stringify(turno.structuredState ?? ESTADO_ESTRUCTURADO_VACIO),
    llm_provider: 'local',
    llm_model: null,
    prompt_version: null,
    trace_id: `req_Sembrado${String(turno.turnNumber).padStart(3, '0')}`,
    created_at: INSTANTE_FIJO,
  });
  return fila['id'] as string;
}

/**
 * Provoca un fallo real de escritura (RN-06): un *trigger* temporal `BEFORE INSERT` en `clinical.conversation_turn` que
 * lanza una excepción con texto sintético. Devuelve la función que lo elimina. La base es de este archivo de test.
 */
export async function instalarFalloDeEscrituraDelTurnoDeChat(
  cliente: Client,
  textoDelError: string,
): Promise<() => Promise<void>> {
  await cliente.query(`
    CREATE FUNCTION clinical.test_falla_insercion_turno_chat() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${textoDelError}'; END $$`);
  await cliente.query(`
    CREATE TRIGGER test_falla_insercion_turno_chat BEFORE INSERT ON clinical.conversation_turn
    FOR EACH ROW EXECUTE FUNCTION clinical.test_falla_insercion_turno_chat()`);
  return async () => {
    await cliente.query(
      'DROP TRIGGER test_falla_insercion_turno_chat ON clinical.conversation_turn',
    );
    await cliente.query('DROP FUNCTION clinical.test_falla_insercion_turno_chat()');
  };
}
