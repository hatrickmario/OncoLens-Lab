import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import respuestaHibrida from '../../../../../contracts/examples/rag-query-hibrida.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type EscenarioDeRag,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9820;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-hibrida-0001';

/** `rag-orchestrator` responde con la búsqueda híbrida: `retrievalMode` `hibrida`, fusión `rrf` y parámetro 60. */
const HIBRIDA: EscenarioDeRag = { tipo: 'json', status: 200, cuerpo: respuestaHibrida };

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_persist_hibrida', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function solicitarAnalisis(traceId: string) {
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: idDePaciente('a'),
      query: PREGUNTA_Q_HER2,
      sourcesSelected: TODAS_LAS_FUENTES,
    });
}

describe('persistencia del bloque retrievalParams con la fusión (RN-06, US-112)', () => {
  it.each([
    ['híbrida', HIBRIDA, 'hibrida', 'rrf', 60],
    ['densa por defecto', undefined, 'dense', 'ninguna', 0],
  ] as const)(
    'persiste retrieval_params con fusion y fusionParam y responde conforme al spec cuando la búsqueda es %s [US-112 AC-5]',
    async (_modo, escenario, retrievalMode, fusion, fusionParam) => {
      if (escenario !== undefined) rag.responder(escenario);
      const traceId = `req_Fusion${retrievalMode}`;

      const respuesta = await solicitarAnalisis(traceId);

      expect(respuesta.status).toBe(200);
      const fila = await leerRegistroPorTrace(mundo.cliente, traceId);
      expect(fila).toBeDefined();
      const persistido = fila!['retrieval_params'] as Record<string, unknown>;
      expect(persistido['retrievalMode']).toBe(retrievalMode);
      expect(persistido['fusion']).toBe(fusion);
      expect(persistido['fusionParam']).toBe(fusionParam);
      expect(Object.keys(persistido).sort()).toEqual(
        [
          'fusion',
          'fusionParam',
          'relevanceThreshold',
          'rerankTopN',
          'retrievalMode',
          'topK',
        ].sort(),
      );
    },
  );
});
