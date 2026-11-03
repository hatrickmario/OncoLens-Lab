import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragTresOpciones from '../../../../../contracts/examples/rag-query-tres-opciones.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9520;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-base-max-follow-ups-0001';
/** Valor de test distinto del 10 por defecto: la Base debe copiarlo de la configuración, no de un literal. */
const TOPE_DE_TEST = 4;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_base_max_follow_ups', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('tope de preguntas de seguimiento en la Base del análisis (RN-22)', () => {
  it('la Base trae maxFollowUps igual a ANALYSIS_FOLLOWUP_MAX y el registro persiste el mismo valor [US-219 AC-1]', async () => {
    rag.responder({ tipo: 'json', status: 200, cuerpo: ragTresOpciones });
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => 'req_BaseMaxFu001' },
      analysisMaxOptions: 3,
      analysisFollowupMax: TOPE_DE_TEST,
    });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_Q_HER2,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.analysisBasis.maxFollowUps).toBe(TOPE_DE_TEST);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_BaseMaxFu001');
    expect((fila!['analysis_basis'] as Record<string, unknown>)['maxFollowUps']).toBe(TOPE_DE_TEST);
    expect(fila!['analysis_basis']).toEqual(respuesta.body.analysisBasis);
  });
});
