import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PII_FX_T4A_A,
  TODAS_LAS_FUENTES,
  TRACE_ID_GENERADO,
  abrirSesion,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 204;
const PREGUNTA_CON_PII = `¿Qué opciones describe la evidencia para ${PII_FX_T4A_A.nombre}, cédula ${PII_FX_T4A_A.cedula}?`;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let patientId: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_logs', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-logs-0001');
  patientId = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('gateway de análisis: logs sin PII', () => {
  it('no registra la pregunta, el texto del contexto ni los identificadores de FX-T4a-a, y sí el traceId generado, cuando el análisis llega a rag-orchestrator', async () => {
    const { app, logger } = await montarGateway(mundo);

    await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ patientId, query: PREGUNTA_CON_PII, sourcesSelected: TODAS_LAS_FUENTES });

    // Sin la llamada saliente, el flujo completo no se ejercitó y la ausencia de PII no probaría nada.
    expect(rag.llamadas()).toBe(1);
    const texto = logger.texto();
    for (const prohibido of [
      PREGUNTA_CON_PII,
      PII_FX_T4A_A.nombre,
      'Lucía',
      'Rondón',
      PII_FX_T4A_A.cedula,
      PII_FX_T4A_A.telefono,
      PII_FX_T4A_A.convenio,
      PII_FX_T4A_A.textoLibre,
      'AC-T',
      'HER2',
      'mama',
    ]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    expect(texto).toContain(TRACE_ID_GENERADO);
  });

  it('no registra la pregunta cuando el desidentificador provisional rechaza el entorno', async () => {
    const { app, logger } = await montarGateway(mundo, { appEnv: 'piloto' });

    await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({ patientId, query: PREGUNTA_CON_PII, sourcesSelected: TODAS_LAS_FUENTES });

    expect(rag.llamadas()).toBe(0);
    const texto = logger.texto();
    for (const prohibido of [PREGUNTA_CON_PII, 'Lucía', PII_FX_T4A_A.cedula]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    expect(texto).toContain(TRACE_ID_GENERADO);
  });
});
