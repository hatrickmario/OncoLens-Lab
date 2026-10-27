import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import {
  CON_AFIRMACION_OMITIDA,
  LLM_OK,
  PREGUNTA_Q_HER2,
  PREGUNTA_Q_SIN,
  SIN_EVIDENCIA,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 662;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-base-analisis-0001';
const SUPUESTO_RETIRADO = 'Los faltantes críticos aún no se calculan en esta versión';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_base_analisis', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** Un `traceId` propio por test: el registro de un test nunca se confunde con el de otro. */
async function analizar(traceId: string, query: string) {
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  const respuesta = await clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: idDePaciente('a'), query, sourcesSelected: TODAS_LAS_FUENTES });
  expect(respuesta.status).toBe(200);
  return respuesta.body as EvidenceAnalysis;
}

/** Toda clave `dataRef` del contexto capturado, a cualquier profundidad: un dato nuevo del contexto no puede quedar fuera. */
const dataRefsEnviados = (): string[] => {
  const encontrados: string[] = [];
  const recorrer = (valor: unknown): void => {
    if (Array.isArray(valor)) valor.forEach(recorrer);
    else if (valor !== null && typeof valor === 'object') {
      for (const [clave, contenido] of Object.entries(valor)) {
        if (clave === 'dataRef') encontrados.push(String(contenido));
        else recorrer(contenido);
      }
    }
  };
  recorrer(rag.capturadas[0]!.cuerpo['clinicalContext']);
  return encontrados;
};

describe('Base del análisis (FR-27)', () => {
  it('devuelve la Base con datos usados, fuentes consultadas, fuentes no incluidas, fecha de corte y sin supuestos cuando Q-HER2 tiene evidencia [US-066 AC-1]', async () => {
    rag.responder(LLM_OK);

    const { analysisBasis: base } = await analizar('req_Base0001', PREGUNTA_Q_HER2);

    const enviados = dataRefsEnviados();
    expect(enviados.length).toBeGreaterThan(0);
    expect(base.patientDataUsed).toHaveLength(enviados.length);
    expect(base.patientDataUsed[0]).toEqual({
      label: 'mama · TNM_8 IIA',
      reviewStatus: 'verificado',
      conflict: false,
    });
    expect(base.patientDataUsed).toContainEqual({
      label: 'HER2 3+ (IHQ)',
      reviewStatus: 'verificado',
      conflict: false,
    });
    expect(base.sourcesConsulted).toEqual({
      selected: ['guias', 'ensayos', 'publicaciones'],
      filters: rag.capturadas[0]!.cuerpo['filtersApplied'],
      retrieved: 40,
      aboveThreshold: 1,
    });
    expect(base.sourcesNotIncluded).toEqual(['NCCN', 'ESMO']);
    expect(base.corpusCutoffDate).toBe('2026-09-30');
    expect(base.missingCriticalData).toEqual(
      (rag.capturadas[0]!.cuerpo['clinicalContext'] as Record<string, unknown>)[
        'missingCriticalData'
      ],
    );
    expect(base.limitations).toEqual([]);
    expect(base.agentSteps).toEqual([]);
    expect(base.priorAnalysesUsed).toEqual([]);
    expect(base.assumptions).toEqual([]);
    expect(JSON.stringify(base)).not.toContain(SUPUESTO_RETIRADO);
  });

  it('devuelve la Base con aboveThreshold 0 y los datos usados cuando no hay evidencia [US-066 AC-2]', async () => {
    rag.responder(SIN_EVIDENCIA);

    const respuesta = await analizar('req_Base0002', PREGUNTA_Q_SIN);

    expect(respuesta['status']).toBe('sin_evidencia');
    const base = respuesta.analysisBasis;
    expect(base.sourcesConsulted).toMatchObject({
      selected: ['guias', 'ensayos', 'publicaciones'],
      retrieved: 40,
      aboveThreshold: 0,
    });
    expect(base.sourcesNotIncluded).toEqual(['NCCN', 'ESMO']);
    expect(base.corpusCutoffDate).toBe('2026-09-30');
    expect(base.patientDataUsed.length).toBeGreaterThan(0);
    expect(base.assumptions).toEqual([]);
  });

  it('cuenta una afirmación omitida sin su texto cuando rag-orchestrator devuelve omittedClaims 1 [US-066 AC-3]', async () => {
    rag.responder(CON_AFIRMACION_OMITIDA);

    const { analysisBasis: base, synthesis } = await analizar('req_Base0003', PREGUNTA_Q_HER2);

    expect(base.omittedClaims).toBe(1);
    const textosDeLaSintesis = (synthesis.agreements as { text: string }[]).map(({ text }) => text);
    expect(textosDeLaSintesis.length).toBeGreaterThan(0);
    for (const texto of textosDeLaSintesis) expect(JSON.stringify(base)).not.toContain(texto);
  });

  it('persiste en el registro la misma Base que responde [US-066 AC-5]', async () => {
    rag.responder(LLM_OK);

    const { analysisBasis: base } = await analizar('req_Base0005', PREGUNTA_Q_HER2);

    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Base0005');
    expect(base.patientDataUsed.length).toBeGreaterThan(0);
    expect(fila!.analysis_basis).toEqual(base);
  });
});
