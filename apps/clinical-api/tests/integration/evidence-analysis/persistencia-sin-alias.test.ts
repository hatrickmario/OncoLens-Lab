import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const ESPACIO_DE_IDS = 2033;
const TRACE_ID = 'req_SinAlias001';
/** Alias efímero de chunk que rag-orchestrator usa solo dentro del prompt (US-236, RN-04): `C1`, `C2`… */
const ALIAS_DE_CHUNK = /\bC\d+\b/;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_sin_alias', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sin-alias-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const chunkIdsDe = (valor: unknown): string[] =>
  [...JSON.stringify(valor).matchAll(/"chunkId":"([^"]+)"/g)].map((m) => m[1]!);

// Regresión: el change l1d-287 no toca clinical-api; fija que el alias nunca cruza la frontera (RN-06).
describe('AIAnalysisRecord y logs frente a los alias de chunk de rag-orchestrator', () => {
  it('persiste solo los chunkId reales de la respuesta y ningún alias C<n> cuando rag-orchestrator responde con evidencia [US-236 AC-5]', async () => {
    const { app, logger } = await montarGateway(mundo, { traceIds: { traceId: () => TRACE_ID } });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_Q_HER2,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    const fila = await leerRegistroPorTrace(mundo.cliente, TRACE_ID);
    const enRespuesta = chunkIdsDe(respuesta.body.evidenceOptions);
    const persistidos = chunkIdsDe(fila!.evidence_options);
    // Sin citas el resto de las aserciones no probaría nada.
    expect(persistidos.length).toBeGreaterThan(0);
    expect(persistidos).toEqual(enRespuesta);
    for (const id of persistidos) expect(id, id).toMatch(/^chunk_\d+$/);
    expect(JSON.stringify(fila!.evidence_options)).not.toMatch(ALIAS_DE_CHUNK);
    expect(logger.texto()).not.toMatch(ALIAS_DE_CHUNK);
    for (const id of persistidos) expect(logger.texto(), id).not.toContain(id);
  });
});
