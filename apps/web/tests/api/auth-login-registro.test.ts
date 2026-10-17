import { afterEach, describe, expect, it, vi } from 'vitest';

const ENTORNO = {
  CLINICAL_API_URL: 'http://clinical-api.test:3000',
  WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
  WEB_UPSTREAM_TIMEOUT_MS: '5000',
  WEB_HOME_PATH: '/pacientes/x/analisis',
};

describe('POST /api/auth/login (route.ts)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('escribe en consola la línea JSON del registro compartido cuando rechaza un Origin ajeno', async () => {
    for (const [nombre, valor] of Object.entries(ENTORNO)) vi.stubEnv(nombre, valor);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { POST } = await import('../../app/api/auth/login/route');

    const respuesta = await POST(
      new Request('http://127.0.0.1:3000/api/auth/login', {
        method: 'POST',
        headers: { Origin: 'https://otro.test', 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );

    expect(respuesta.status).toBe(403);
    const linea = JSON.parse(String(info.mock.calls.at(-1)?.[0]));
    expect(linea).toMatchObject({ event: 'auth.login', status: 403, motivo: 'origen' });
  });
});
