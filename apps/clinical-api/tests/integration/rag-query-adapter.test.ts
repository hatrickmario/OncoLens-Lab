import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import requestEjemplo from '../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import respuestaEjemplo from '../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import llmLocalNoDisponible from '../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { createRagOrchestratorClient } from '../../src/infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner } from '../../src/infrastructure/service-jwt.js';
import { crearRagQueryClient } from '../../src/modules/evidence-analysis/rag-query.adapter.js';
import { generarParEfimero, relojCongelado } from '../support/service-jwt.js';

const BASE_URL = 'http://rag-orchestrator:8000';
const request = requestEjemplo as RagQueryInternalRequest;
const servidor = setupServer();
let rag: ReturnType<typeof crearRagQueryClient>;

beforeAll(async () => {
  const { privateKey } = await generarParEfimero();
  const signer = createServiceTokenSigner({ privateKey, clock: relojCongelado(), ttlSeconds: 60 });
  rag = crearRagQueryClient(createRagOrchestratorClient({ baseUrl: BASE_URL, signer }));
  servidor.listen({ onUnhandledFrame: ({ defaults }) => defaults.error() });
});
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

describe('puerto RagQueryClient sobre el SDK de rag-orchestrator', () => {
  it('devuelve ok con el cuerpo cuando rag-orchestrator responde 200', async () => {
    servidor.use(http.post(`${BASE_URL}/rag/query`, () => HttpResponse.json(respuestaEjemplo)));

    expect(await rag.consultar(request)).toEqual({ ok: true, cuerpo: respuestaEjemplo });
  });

  it('devuelve el estado y el código de error, sin el mensaje ni el cuerpo, cuando rag-orchestrator responde un error', async () => {
    servidor.use(
      http.post(`${BASE_URL}/rag/query`, () =>
        HttpResponse.json(llmLocalNoDisponible, { status: 503 }),
      ),
    );

    const resultado = await rag.consultar(request);

    expect(resultado).toEqual({ ok: false, status: 503, codigo: 'LOCAL_LLM_UNAVAILABLE' });
  });

  it('devuelve código null cuando el cuerpo de error no es un objeto con error', async () => {
    servidor.use(
      http.post(`${BASE_URL}/rag/query`, () => new HttpResponse('texto interno', { status: 500 })),
    );

    expect(await rag.consultar(request)).toEqual({ ok: false, status: 500, codigo: null });
  });

  it('devuelve status null sin tiempoAgotado cuando la conexión falla', async () => {
    servidor.use(http.post(`${BASE_URL}/rag/query`, () => HttpResponse.error()));

    expect(await rag.consultar(request)).toEqual({
      ok: false,
      status: null,
      codigo: null,
      tiempoAgotado: false,
    });
  });

  it('devuelve tiempoAgotado cuando la señal aborta la llamada', async () => {
    servidor.use(
      http.post(`${BASE_URL}/rag/query`, async () => {
        await delay(1000);
        return HttpResponse.json(respuestaEjemplo);
      }),
    );
    const controlador = new AbortController();
    const pendiente = rag.consultar(request, { signal: controlador.signal });
    controlador.abort();

    expect(await pendiente).toEqual({
      ok: false,
      status: null,
      codigo: null,
      tiempoAgotado: true,
    });
  });
});
