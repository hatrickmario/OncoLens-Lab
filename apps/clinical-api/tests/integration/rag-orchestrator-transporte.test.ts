import { jwtVerify, type CryptoKey } from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRagOrchestratorFetch } from '../../src/infrastructure/rag-orchestrator.http.js';
import { createServiceTokenSigner } from '../../src/infrastructure/service-jwt.js';
import { generarParEfimero, INSTANTE_CONGELADO, relojCongelado } from '../support/service-jwt.js';

const BASE_URL = 'http://rag-orchestrator:8000';
const TTL_SEGUNDOS = 60;

const capturadas: Headers[] = [];
const servidor = setupServer(
  http.post(`${BASE_URL}/rag/query`, ({ request }) => {
    capturadas.push(request.headers);
    return HttpResponse.json({ ok: true });
  }),
);

let publicKey: CryptoKey;
let privateKey: CryptoKey;

beforeAll(async () => {
  ({ publicKey, privateKey } = await generarParEfimero());
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

describe('transporte hacia rag-orchestrator', () => {
  it('envía Authorization Bearer verificable y ninguna cabecera Cookie cuando clinical-api llama a /rag/query por un análisis del doctor [US-054 AC-4]', async () => {
    const signer = createServiceTokenSigner({
      privateKey,
      clock: relojCongelado(),
      ttlSeconds: TTL_SEGUNDOS,
    });
    const ragFetch = createRagOrchestratorFetch({ baseUrl: BASE_URL, signer });

    const respuesta = await ragFetch(`${BASE_URL}/rag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'oncolens_session=sesion-sintetica-123',
      },
      body: JSON.stringify({ query: 'sintetica' }),
    });

    expect(respuesta.status).toBe(200);
    expect(capturadas).toHaveLength(1);
    const cabeceras = capturadas[0]!;
    expect(cabeceras.has('cookie')).toBe(false);
    const autorizacion = cabeceras.get('authorization') ?? '';
    expect(autorizacion).toMatch(/^Bearer /);
    const { payload, protectedHeader } = await jwtVerify(
      autorizacion.slice('Bearer '.length),
      publicKey,
      {
        algorithms: ['ES256'],
        issuer: 'clinical-api',
        audience: 'rag-orchestrator',
      },
    );
    expect(protectedHeader).toEqual({ alg: 'ES256', typ: 'JWT' });
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss']);
    expect(payload.iat).toBe(INSTANTE_CONGELADO.getTime() / 1000);
    expect(payload.exp).toBe(INSTANTE_CONGELADO.getTime() / 1000 + TTL_SEGUNDOS);
  });

  it('no sigue la redirección y no reenvía el token cuando rag-orchestrator responde 307 a otro origen', async () => {
    const llegadasAlOtroOrigen: Headers[] = [];
    servidor.use(
      http.post(
        `${BASE_URL}/rag/query`,
        () =>
          new HttpResponse(null, {
            status: 307,
            headers: { Location: 'http://otro-origen:9000/captura' },
          }),
      ),
      http.post('http://otro-origen:9000/captura', ({ request }) => {
        llegadasAlOtroOrigen.push(request.headers);
        return HttpResponse.json({});
      }),
    );
    const signer = createServiceTokenSigner({
      privateKey,
      clock: relojCongelado(),
      ttlSeconds: TTL_SEGUNDOS,
    });
    const ragFetch = createRagOrchestratorFetch({ baseUrl: BASE_URL, signer });

    await expect(
      ragFetch(`${BASE_URL}/rag/query`, {
        method: 'POST',
        body: JSON.stringify({ query: 'sintetica' }),
      }),
    ).rejects.toThrow();

    expect(llegadasAlOtroOrigen).toHaveLength(0);
  });
});
