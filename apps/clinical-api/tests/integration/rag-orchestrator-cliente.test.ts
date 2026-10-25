import { jwtVerify, type CryptoKey } from 'jose';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ragQuery,
  type RagQueryInternalRequest,
} from '../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import requestEjemplo from '../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import respuestaEjemplo from '../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import { handlerDesdeEjemplo } from '../../../../packages/test-support/msw/index.js';
import { createRagOrchestratorClient } from '../../src/infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner } from '../../src/infrastructure/service-jwt.js';
import { generarParEfimero, INSTANTE_CONGELADO, relojCongelado } from '../support/service-jwt.js';

const BASE_URL = 'http://rag-orchestrator:8000';
const cuerpo: RagQueryInternalRequest = requestEjemplo as RagQueryInternalRequest; // el JSON ensancha los enums a string; el ejemplo cumple el contrato
const DEADLINE = '2026-10-16T12:00:15.000Z';

type Capturada = { headers: Headers; body: unknown };
const capturadas: Capturada[] = [];
// El handler sale de contracts/examples/ (ADR-26, US-213 AC-10): el mock no puede divergir del contrato.
const servidor = setupServer(
  handlerDesdeEjemplo(
    { metodo: 'post', url: `${BASE_URL}/rag/query` },
    'rag-query-con-evidencia.json',
    {
      alRecibir: async (peticion) => {
        capturadas.push({ headers: peticion.headers, body: await peticion.json() });
      },
    },
  ),
);

let publicKey: CryptoKey;
let cliente: ReturnType<typeof createRagOrchestratorClient>;

beforeAll(async () => {
  const { privateKey, publicKey: publica } = await generarParEfimero();
  publicKey = publica;
  const signer = createServiceTokenSigner({ privateKey, clock: relojCongelado(), ttlSeconds: 60 });
  cliente = createRagOrchestratorClient({ baseUrl: BASE_URL, signer });
  servidor.listen({ onUnhandledFrame: ({ defaults }) => defaults.error() });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: INSTANTE_CONGELADO });
});
afterEach(() => {
  vi.useRealTimers();
  servidor.resetHandlers();
  capturadas.length = 0;
});
afterAll(() => servidor.close());

async function bearerVerificable(cabeceras: Headers): Promise<void> {
  const autorizacion = cabeceras.get('authorization') ?? '';
  expect(autorizacion).toMatch(/^Bearer /);
  await jwtVerify(autorizacion.slice('Bearer '.length), publicKey, {
    algorithms: ['ES256'],
    issuer: 'clinical-api',
    audience: 'rag-orchestrator',
  });
}

describe('cliente de rag-orchestrator', () => {
  it('envía el X-Request-Deadline que pasa el llamador y el Bearer verificable, y omite la cabecera cuando no se pasa [US-054 AC-6]', async () => {
    const conDeadline = await ragQuery({
      client: cliente,
      body: cuerpo,
      headers: { 'X-Request-Deadline': DEADLINE },
    });
    const sinDeadline = await ragQuery({ client: cliente, body: cuerpo });

    expect(conDeadline.response?.status).toBe(200);
    expect(conDeadline.data).toEqual(respuestaEjemplo);
    expect(capturadas).toHaveLength(2);
    expect(capturadas[0]!.headers.get('x-request-deadline')).toBe(DEADLINE);
    expect(capturadas[1]!.headers.has('x-request-deadline')).toBe(false);
    expect(capturadas[0]!.body).toEqual(requestEjemplo);
    expect(sinDeadline.response?.status).toBe(200);
    for (const { headers } of capturadas) await bearerVerificable(headers);
  });
});
