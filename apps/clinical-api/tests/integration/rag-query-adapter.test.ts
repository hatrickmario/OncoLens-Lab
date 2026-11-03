import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import requestEjemplo from '../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import respuestaEjemplo from '../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import llmLocalNoDisponible from '../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { createRagOrchestratorClient } from '../../src/infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner } from '../../src/infrastructure/service-jwt.js';
import requestSeguimiento from '../../../../contracts/examples/rag-follow-up-request.json' with { type: 'json' };
import type { RagFollowUpRequest } from '../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import {
  crearRagFollowUpClient,
  crearRagQueryClient,
} from '../../src/modules/evidence-analysis/rag-query.adapter.js';
import { generarParEfimero, relojCongelado } from '../support/service-jwt.js';

const BASE_URL = 'http://rag-orchestrator:8000';
const request = requestEjemplo as RagQueryInternalRequest;
const servidor = setupServer();
let rag: ReturnType<typeof crearRagQueryClient>;
let seguimiento: ReturnType<typeof crearRagFollowUpClient>;

beforeAll(async () => {
  const { privateKey } = await generarParEfimero();
  const signer = createServiceTokenSigner({ privateKey, clock: relojCongelado(), ttlSeconds: 60 });
  const sdk = createRagOrchestratorClient({ baseUrl: BASE_URL, signer });
  rag = crearRagQueryClient(sdk);
  seguimiento = crearRagFollowUpClient(sdk);
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

describe('paridad de fallos entre consultar y responder', () => {
  const MENSAJE_HOSTIL = 'host interno rag-db.internal y texto de la pregunta';

  it('produce el mismo FalloDeRag, sin mensaje ni cuerpo, ante el mismo 5xx hostil en /rag/query y en /rag/follow-up', async () => {
    const hostil = () =>
      HttpResponse.json({ error: 'NLI_UNAVAILABLE', message: MENSAJE_HOSTIL }, { status: 503 });
    servidor.use(
      http.post(`${BASE_URL}/rag/query`, hostil),
      http.post(`${BASE_URL}/rag/follow-up`, hostil),
    );

    const deQuery = await rag.consultar(request);
    const deSeguimiento = await seguimiento.responder(requestSeguimiento as RagFollowUpRequest);

    expect(deSeguimiento).toEqual(deQuery);
    expect(JSON.stringify(deSeguimiento)).not.toContain(MENSAJE_HOSTIL);
  });

  it('envía X-Trace-Id y X-Request-Deadline en las dos operaciones', async () => {
    const cabeceras: Headers[] = [];
    const captura = ({ request: r }: { request: Request }) => {
      cabeceras.push(r.headers);
      return HttpResponse.json({}, { status: 500 });
    };
    servidor.use(
      http.post(`${BASE_URL}/rag/query`, captura),
      http.post(`${BASE_URL}/rag/follow-up`, captura),
    );
    const deadline = '2026-10-16T12:00:30.000Z';

    await rag.consultar(request, { deadline });
    await seguimiento.responder(requestSeguimiento as RagFollowUpRequest, { deadline });

    expect(cabeceras.map((h) => h.get('x-request-deadline'))).toEqual([deadline, deadline]);
    expect(cabeceras[1]!.get('x-trace-id')).toBe(requestSeguimiento.traceId);
  });
});
