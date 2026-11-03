import type { Express } from 'express';
import type { Client } from 'pg';
import ragSeguimiento from '../../../../contracts/examples/rag-follow-up-response.json' with { type: 'json' };
import ragTresOpciones from '../../../../contracts/examples/rag-query-tres-opciones.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  type MundoDeGateway,
  type RagSimulado,
} from './gateway.js';
import { filaDeSeguimiento, insertar } from './filas-sinteticas.js';
import { clienteVerificado } from './verificarProveedor.js';

/**
 * Soporte del seguimiento (US-218): crea un análisis `con_evidencia` por la API real (rag-orchestrator simulado desde
 * `contracts/examples/`), siembra turnos y arma respuestas de `/rag/follow-up` con chunks a elección. Todo sintético.
 */

export const PREGUNTA_DE_SEGUIMIENTO =
  '¿La evidencia describe diferencias para la opción 2 según el estado menopáusico?';

/** `RagFollowUpResponse` con evidencia cuyas citas apuntan a los `chunkId` indicados (la primera cita es la del ejemplo). */
export function respuestaDeSeguimientoCitando(chunkIds: readonly string[]): object {
  const cuerpo = structuredClone(ragSeguimiento) as typeof ragSeguimiento;
  const [plantilla] = cuerpo.citedSources;
  if (plantilla === undefined) throw new Error('el ejemplo no trae citas');
  cuerpo.citedSources = chunkIds.map((chunkId) => ({ ...structuredClone(plantilla), chunkId }));
  const [primera] = cuerpo.citedSources;
  const [afirmacion] = cuerpo.answer;
  if (primera === undefined || afirmacion === undefined)
    throw new Error('el ejemplo no trae respuesta');
  afirmacion.citedSources = [structuredClone(primera)];
  return cuerpo;
}

/** Crea un análisis `con_evidencia` de tres opciones sobre `patientId` y devuelve su cuerpo (id, opciones, Base). */
export async function crearAnalisisConEvidencia(
  app: Express,
  cookie: string,
  rag: RagSimulado,
  patientId: string,
): Promise<{ id: string; evidenceOptions: { option: string }[] }> {
  rag.responder({ tipo: 'json', status: 200, cuerpo: ragTresOpciones });
  const respuesta = await clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
  if (respuesta.status !== 200)
    throw new Error(`el análisis de prueba respondió ${respuesta.status}`);
  return respuesta.body as { id: string; evidenceOptions: { option: string }[] };
}

/** Inserta `cantidad` turnos de seguimiento ya persistidos (1…`cantidad`), con la huella mínima válida. */
export async function sembrarTurnos(
  mundo: MundoDeGateway,
  analysisId: string,
  cantidad: number,
): Promise<void> {
  for (let turno = 1; turno <= cantidad; turno += 1) {
    await insertar(
      mundo.cliente,
      'clinical.analysis_follow_up',
      filaDeSeguimiento(mundo.idsDeTurnos, analysisId, {
        turn_number: turno,
        question_text: `pregunta sintética ${turno}`,
        patient_data_links: JSON.stringify([]),
        trace_id: `req_Sembrado${String(turno).padStart(3, '0')}`,
      }),
    );
  }
}

export interface FilaDeTurnoPersistido {
  id: string;
  analysis_id: string;
  turn_number: number;
  question_text: string;
  status: string;
  answer: unknown;
  cited_sources: { chunkId: string; isNewSource: boolean }[];
  patient_data_links: unknown;
  trace_id: string;
}

export async function leerTurnos(
  cliente: Client,
  analysisId: string,
): Promise<FilaDeTurnoPersistido[]> {
  const { rows } = await cliente.query<FilaDeTurnoPersistido>(
    'SELECT * FROM clinical.analysis_follow_up WHERE analysis_id = $1 ORDER BY turn_number',
    [analysisId],
  );
  return rows;
}

/** Toda fila de `analysis_follow_up` como texto: las columnas se revisan juntas contra lo que no puede persistirse. */
export async function textoDeLosTurnos(cliente: Client, analysisId: string): Promise<string> {
  const { rows } = await cliente.query(
    'SELECT * FROM clinical.analysis_follow_up WHERE analysis_id = $1',
    [analysisId],
  );
  return JSON.stringify(rows);
}

export const rutaDeSeguimiento = (analysisId: string): string =>
  `/platform/evidence-analyses/${analysisId}/follow-ups`;
