import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { createApp } from '../../src/app.js';
import { cargarConfiguracion, observarEntorno } from '../../src/config/index.js';

// Sin handlers: cualquier petición saliente (p. ej. a rag-orchestrator) falla el test. Supertest llama a la propia
// aplicación por loopback; esa petición pasa y no cuenta como saliente.
const esLoopback = (url: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
const servidor = setupServer();
const peticionesSalientes: string[] = [];
servidor.events.on('request:start', ({ request }) => {
  if (!esLoopback(request.url)) peticionesSalientes.push(request.url);
});

beforeAll(() =>
  servidor.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      if (frame.protocol === 'http' && esLoopback((frame.data as { request: Request }).request.url))
        frame.passthrough();
      else defaults.error();
    },
  }),
);
afterEach(() => {
  peticionesSalientes.length = 0;
});
afterAll(() => servidor.close());

describe('GET /health', () => {
  it('responde 200 con status ok, configKeys y serviceVersion validado contra el spec cuando el proceso está listo [US-037 AC-1]', async () => {
    const respuesta = await request(
      createApp({ salud: { configKeys: ['PORT', 'SESSION_TTL_HOURS'], serviceVersion: '1.2.3' } }),
    ).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      status: 'ok',
      configKeys: ['PORT', 'SESSION_TTL_HOURS'],
      serviceVersion: '1.2.3',
    });
    assertMatchesSpec('clinical-api', '#/paths/~1health/get/responses/200', respuesta.body);
  });

  it('responde configKeys con los nombres cargados y ningún valor de configuración ni ruta de secreto cuando el entorno trae valores [US-037 AC-1]', async () => {
    const observado = observarEntorno({
      PORT: '4123',
      SESSION_TTL_HOURS: '8',
      IDENTITY_AES_KEY_FILE: '/ruta/ficticia/secreto-aes',
      BLIND_INDEX_HMAC_KEY_FILE: '/ruta/ficticia/secreto-hmac',
    });
    cargarConfiguracion(observado.env);

    const respuesta = await request(
      createApp({ salud: { configKeys: observado.clavesCargadas(), serviceVersion: '1.2.3' } }),
    ).get('/health');

    expect(respuesta.body.configKeys).toEqual([
      'BLIND_INDEX_HMAC_KEY_FILE',
      'IDENTITY_AES_KEY_FILE',
      'PORT',
      'SESSION_TTL_HOURS',
    ]);
    for (const valor of ['4123', '/ruta/ficticia', 'secreto-aes', 'secreto-hmac']) {
      expect(JSON.stringify(respuesta.body), valor).not.toContain(valor);
    }
    assertMatchesSpec('clinical-api', '#/paths/~1health/get/responses/200', respuesta.body);
  });

  it('responde 200 sin emitir cookie cuando la aplicación se crea sin dependencias (no consulta a rag-orchestrator)', async () => {
    const respuesta = await request(createApp({})).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['set-cookie']).toBeUndefined();
    expect(peticionesSalientes).toEqual([]);
  });
});
