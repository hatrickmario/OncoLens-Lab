import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { createApp } from '../../src/app.js';

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
  });
});
