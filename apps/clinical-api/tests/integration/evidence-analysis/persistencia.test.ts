import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  DISCLAIMER_DE_TEST,
  PREGUNTA_Q_HER2,
  PREGUNTA_Q_SIN,
  PUNTERO_200,
  SIN_EVIDENCIA,
  SUPUESTO_S1_DE_TEST,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarEventosDelPaciente,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 301;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-persistencia-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let idDelDoctor: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_persistencia', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  const { rows } = await mundo.cliente.query<{ id: string }>(
    `SELECT id FROM auth."user" WHERE email = 'doc1@test.local'`,
  );
  idDelDoctor = rows[0]?.id ?? '';
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** Un `traceId` propio por test: el registro de un test nunca se confunde con el de otro. */
const gateway = (traceId: string) => montarGateway(mundo, { ids: { traceId: () => traceId } });

const cuerpoDelAnalisis = (query: string, extra: Record<string, unknown> = {}) => ({
  patientId: idDePaciente('a'),
  query,
  sourcesSelected: TODAS_LAS_FUENTES,
  ...extra,
});

async function solicitar(
  app: Awaited<ReturnType<typeof gateway>>['app'],
  query: string,
  extra: Record<string, unknown> = {},
  cabeceras: Record<string, string> = {},
) {
  return request(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .set(cabeceras)
    .send(cuerpoDelAnalisis(query, extra));
}

describe('persistencia del análisis antes de responder (RN-06)', () => {
  it('responde 200 con el mismo id, trace_id y evidenceOptions que el ai_analysis_record persistido con top_relevance_score 0.87 [US-053 AC-1]', async () => {
    const { app } = await gateway('req_Persist0001');

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    assertMatchesSpec('clinical-api', PUNTERO_200, respuesta.body);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Persist0001');
    expect(fila).toBeDefined();
    expect(fila!.id).toBe(respuesta.body.id);
    expect(fila!.trace_id).toBe(respuesta.body.traceId);
    expect(fila).toMatchObject({
      analysis_type: 'analisis_evidencia',
      requested_by: idDelDoctor,
      patient_id: idDePaciente('a'),
      status: 'con_evidencia',
      top_relevance_score: 0.87,
      corpus_release: '2026-09-30',
      catalog_version: '2026.10.0',
      llm_provider: 'local',
      llm_model: 'llm-local-ejemplo',
      embedding_model: 'embedding-local-ejemplo',
      reranker_model: 'reranker-local-ejemplo',
      nli_model: 'nli-local-ejemplo',
      prompt_version: 'rag-query@0.1.0',
      retrieval_params: {
        topK: 40,
        rerankTopN: 10,
        relevanceThreshold: 0.5,
        retrievalMode: 'dense',
      },
    });
    expect(fila!.context_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fila!.clinical_context_snapshot).toBeTypeOf('object');
    expect(respuesta.body.evidenceOptions).toEqual(fila!.evidence_options);
    expect(respuesta.body.analysisBasis).toEqual(fila!.analysis_basis);
    expect(respuesta.body.topRelevanceScore).toBe(0.87);
    expect(respuesta.body.disclaimer).toBe(DISCLAIMER_DE_TEST);
  });

  it('persiste patient_data_links con las referencias rN del contexto enviado a rag-orchestrator [US-053 AC-1]', async () => {
    const { app } = await gateway('req_Persist0002');

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    const enviadas = [...rag.capturadas[0]!.texto.matchAll(/"dataRef":"(r\d+)"/g)].map(
      (coincidencia) => coincidencia[1],
    );
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Persist0002');
    expect(enviadas.length).toBeGreaterThan(0);
    expect(fila!.patient_data_links.map((enlace) => enlace.dataRef).sort()).toEqual(
      [...enviadas].sort(),
    );
    expect(respuesta.body.patientDataLinks).toEqual(fila!.patient_data_links);
  });

  it('persiste como trace_id el traceId generado y no el X-Trace-Id entrante [US-053 AC-1]', async () => {
    const { app } = await gateway('req_TestGen0001');

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2, {}, { 'X-Trace-Id': 'req_Entrante01' });

    expect(respuesta.status).toBe(200);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_TestGen0001');
    expect(fila).toBeDefined();
    expect(fila!.trace_id).toBe('req_TestGen0001');
    expect(JSON.stringify(fila)).not.toContain('req_Entrante01');
  });

  it('persiste el snapshot sin pseudoPatientId ni el valor del seudónimo enviado [US-053 AC-1]', async () => {
    const { app } = await gateway('req_Persist0003');

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    const enviado = rag.capturadas[0]!.cuerpo as { clinicalContext: { pseudoPatientId: string } };
    const seudonimo = enviado.clinicalContext.pseudoPatientId;
    expect(seudonimo).toMatch(/^psd_/);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Persist0003');
    expect(fila!.clinical_context_snapshot).not.toHaveProperty('pseudoPatientId');
    expect(JSON.stringify(fila)).not.toContain(seudonimo);
    expect(fila!.clinical_context_snapshot).toHaveProperty('diagnosis');
  });

  it.each([
    ['con evidencia', PREGUNTA_Q_HER2, undefined],
    ['sin evidencia', PREGUNTA_Q_SIN, SIN_EVIDENCIA],
  ])(
    'incluye en analysisBasis.assumptions el supuesto fijo de configuración con patientDataUsed y missingCriticalData vacíos cuando el análisis es %s [US-053 AC-1]',
    async (_caso, pregunta, escenario) => {
      if (escenario !== undefined) rag.responder(escenario);
      const { app } = await gateway(`req_Supuesto${escenario === undefined ? 'A' : 'B'}01`);

      const respuesta = await solicitar(app, pregunta);

      expect(respuesta.status).toBe(200);
      const base = respuesta.body.analysisBasis;
      expect(base.patientDataUsed).toEqual([]);
      expect(base.missingCriticalData).toEqual([]);
      expect(base.assumptions).toContainEqual({
        text: SUPUESTO_S1_DE_TEST,
        origin: 'regla_catalogo',
      });
      const fila = await leerRegistroPorTrace(
        mundo.cliente,
        `req_Supuesto${escenario === undefined ? 'A' : 'B'}01`,
      );
      expect(fila!.analysis_basis).toEqual(base);
    },
  );

  it('responde 200 con topRelevanceScore null y analysisBasis y persiste top_relevance_score NULL cuando no hay evidencia [US-053 AC-5]', async () => {
    rag.responder(SIN_EVIDENCIA);
    const { app } = await gateway('req_SinEvid0001');

    const respuesta = await solicitar(app, PREGUNTA_Q_SIN);

    expect(respuesta.status).toBe(200);
    assertMatchesSpec('clinical-api', PUNTERO_200, respuesta.body);
    expect(respuesta.body).toMatchObject({
      status: 'sin_evidencia',
      topRelevanceScore: null,
      evidenceOptions: [],
    });
    expect(respuesta.body.analysisBasis).toBeDefined();
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_SinEvid0001');
    expect(fila!.top_relevance_score).toBeNull();
    expect(fila!.status).toBe('sin_evidencia');
    expect(fila!.evidence_options).toEqual([]);
    expect(fila!.analysis_basis).toEqual(respuesta.body.analysisBasis);
  });

  it('no cambia el número de clinical_event del paciente tras un análisis [US-053 AC-6]', async () => {
    const { app } = await gateway('req_Eventos0001');
    const antes = await contarEventosDelPaciente(mundo.cliente, idDePaciente('a'));

    const respuesta = await solicitar(app, PREGUNTA_Q_HER2);

    expect(respuesta.status).toBe(200);
    expect(await leerRegistroPorTrace(mundo.cliente, 'req_Eventos0001')).toBeDefined();
    expect(await contarEventosDelPaciente(mundo.cliente, idDePaciente('a'))).toBe(antes);
  });
});
