import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { createApp } from '../../src/app.js';

// Sin handlers: cualquier petición saliente (p. ej. a rag-orchestrator) falla el test. Supertest llama a la propia
// aplicación por loopback; esa petición pasa y no cuenta como saliente.
const esLoopback = (url: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
const servidor = setupServer();
const peticionesSalientes: string[] = [];
servidor.events.on('request:start', ({ request }) => {
  if (!esLoopback(request.url)) peticionesSalientes.push(request.url);
});

beforeAll(() =>
  servidor.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      if (frame.protocol === 'http' && esLoopback(frame.data.request.url)) frame.passthrough();
      else defaults.error();
    },
  }),
);
afterEach(() => {
  peticionesSalientes.length = 0;
});
afterAll(() => servidor.close());

describe('GET /health', () => {
  it('responde 200 con status ok validado contra el spec cuando el proceso está listo [US-034 AC-1]', async () => {
    const respuesta = await request(createApp({})).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: 'ok' });
    assertMatchesSpec('clinical-api', '#/paths/~1health/get/responses/200', respuesta.body);
  });

  it('responde 200 sin emitir cookie cuando la aplicación se crea sin dependencias (no consulta a rag-orchestrator)', async () => {
    const respuesta = await request(createApp({})).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['set-cookie']).toBeUndefined();
    expect(peticionesSalientes).toEqual([]);
  });
});
