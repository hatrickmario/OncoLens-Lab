import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupServer } from 'msw/node';
import { clienteVerificado } from '../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { cargarConfiguracion, observarEntorno } from '../../src/config/index.js';
import { componerInformacionDeSalud } from '../../src/routes/health.js';
import { crearProveedorDeCatalogo } from '../../src/modules/evidence-analysis/catalog-version.provider.js';
import { RUTA_DEL_CATALOGO } from '../support/seed.js';

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
  it('responde 200 con status ok, configKeys y serviceVersion validado contra el spec cuando el proceso está listo [US-034 AC-1] [US-037 AC-1]', async () => {
    const respuesta = await clienteVerificado(
      createApp({ salud: { configKeys: ['PORT', 'SESSION_TTL_HOURS'], serviceVersion: '1.2.3' } }),
    ).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      status: 'ok',
      configKeys: ['PORT', 'SESSION_TTL_HOURS'],
      serviceVersion: '1.2.3',
    });
  });

  it('responde configKeys con los nombres cargados y ningún valor de configuración ni ruta de secreto cuando el entorno trae valores [US-037 AC-1]', async () => {
    const observado = observarEntorno({
      PORT: '4123',
      SESSION_TTL_HOURS: '8',
      IDENTITY_AES_KEY_FILE: '/ruta/ficticia/secreto-aes',
      BLIND_INDEX_HMAC_KEY_FILE: '/ruta/ficticia/secreto-hmac',
    });
    cargarConfiguracion(observado.env);

    const respuesta = await clienteVerificado(
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
  });

  it('no lista variables ajenas del entorno (HOSTNAME, AWS_SECRET_ACCESS_KEY) en configKeys cuando el proceso las tiene [US-037 AC-1]', async () => {
    const observado = observarEntorno({
      PORT: '4123',
      IDENTITY_AES_KEY_FILE: '/ruta/ficticia/aes',
      BLIND_INDEX_HMAC_KEY_FILE: '/ruta/ficticia/hmac',
      HOSTNAME: 'contenedor-sintetico',
      AWS_SECRET_ACCESS_KEY: 'valor-sintetico-de-prueba',
      IDENTITY_KEY_VERSION: '2',
      IDENTITY_AES_KEY_V1_FILE: '/ruta/ficticia/aes-v1',
    });
    cargarConfiguracion(observado.env);

    const respuesta = await clienteVerificado(
      createApp({ salud: { configKeys: observado.clavesCargadas(), serviceVersion: '1.2.3' } }),
    ).get('/health');

    expect(respuesta.body.configKeys).not.toContain('HOSTNAME');
    expect(respuesta.body.configKeys).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(respuesta.body.configKeys).toEqual([
      'BLIND_INDEX_HMAC_KEY_FILE',
      'IDENTITY_AES_KEY_FILE',
      'IDENTITY_AES_KEY_V1_FILE',
      'IDENTITY_KEY_VERSION',
      'PORT',
    ]);
  });

  it('informa catalogVersion 1.0.1 validado contra el spec cuando CLINICAL_CATALOG_PATH apunta a un catálogo 1.0.1 [US-041 AC-4]', async () => {
    const directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-catalogo-'));
    try {
      writeFileSync(path.join(directorio, 'manifest.json'), JSON.stringify({ version: '1.0.1' }));
      const catalogo = crearProveedorDeCatalogo(directorio, (ruta) => readFileSync(ruta, 'utf8'));

      const respuesta = await clienteVerificado(
        createApp({
          salud: { configKeys: [], serviceVersion: '1.2.3', catalogVersion: catalogo.version() },
        }),
      ).get('/health');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.catalogVersion).toBe('1.0.1');
      expect(JSON.stringify(respuesta.body)).not.toContain(directorio);
    } finally {
      rmSync(directorio, { recursive: true, force: true });
    }
  });

  it('responde catalogVersion exacto del manifiesto, sin añadidos, cuando /health se compone con el proveedor del arranque [US-041 AC-4]', async () => {
    const manifiesto = JSON.parse(
      readFileSync(path.join(RUTA_DEL_CATALOGO, 'manifest.json'), 'utf8'),
    ) as { version: string };
    const catalogo = crearProveedorDeCatalogo(RUTA_DEL_CATALOGO, (ruta) =>
      readFileSync(ruta, 'utf8'),
    );

    const salud = componerInformacionDeSalud({
      configKeys: ['PORT'],
      serviceVersion: '1.2.3',
      catalogo,
    });
    const respuesta = await clienteVerificado(createApp({ salud })).get('/health');

    expect(respuesta.body).toEqual({
      status: 'ok',
      configKeys: ['PORT'],
      serviceVersion: '1.2.3',
      catalogVersion: manifiesto.version,
    });
  });

  it('responde 200 sin emitir cookie cuando la aplicación se crea sin dependencias (no consulta a rag-orchestrator)', async () => {
    const respuesta = await clienteVerificado(createApp({})).get('/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['set-cookie']).toBeUndefined();
    expect(peticionesSalientes).toEqual([]);
  });
});
