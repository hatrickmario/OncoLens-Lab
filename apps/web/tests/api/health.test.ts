import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '../../app/api/health/route';

// Sin handlers y con onUnhandledFrame: 'error' (MSW 3): cualquier petición saliente (p. ej. a clinical-api) falla el test.
const servidor = setupServer();
const peticionesSalientes: string[] = [];
servidor.events.on('request:start', ({ request }) => {
  peticionesSalientes.push(request.url);
});

beforeAll(() => servidor.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  peticionesSalientes.length = 0;
});
afterAll(() => servidor.close());

describe('GET /api/health', () => {
  it('responde 200 con status ok sin petición saliente a clinical-api cuando no hay sesión [US-034 AC-1]', async () => {
    const respuesta = await GET();

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ status: 'ok' });
    expect(peticionesSalientes).toEqual([]);
  });
});
