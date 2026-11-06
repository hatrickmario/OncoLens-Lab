import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { ID_SEMILLA_A, iniciarSesion } from './soporte';

const ORIGEN_AJENO = 'http://atacante.test';

function csp(respuesta: APIResponse): string {
  return respuesta.headers()['content-security-policy'] ?? '';
}

function nonceDe(politica: string): string {
  return /'nonce-([^']+)'/.exec(politica)?.[1] ?? '';
}

function exigirCspEstricta(politica: string): void {
  expect(politica).toContain("default-src 'self'");
  expect(politica).toContain("object-src 'none'");
  expect(politica).toContain("base-uri 'none'");
  expect(politica).toContain("frame-ancestors 'none'");
  const scripts = politica.split(';').find((d) => d.trim().startsWith('script-src')) ?? '';
  expect(scripts).toContain("'nonce-");
  expect(scripts).not.toContain('unsafe-inline');
  expect(scripts).not.toContain('unsafe-eval');
}

function exigirEndurecimiento(respuesta: APIResponse): void {
  const cabeceras = respuesta.headers();
  expect(cabeceras['x-content-type-options']).toBe('nosniff');
  expect(cabeceras['referrer-policy']).toBe('no-referrer');
  expect(cabeceras['x-frame-options']).toBe('DENY');
  const permisos = cabeceras['permissions-policy'] ?? '';
  for (const denegada of ['camera=()', 'microphone=()', 'geolocation=()']) {
    expect(permisos).toContain(denegada);
  }
}

function recogerViolacionesDeCsp(page: Page): string[] {
  const violaciones: string[] = [];
  page.on('console', (mensaje) => {
    if (/Content Security Policy|Refused to/i.test(mensaje.text()))
      violaciones.push(mensaje.text());
  });
  return violaciones;
}

test.describe('Cabeceras de seguridad de web (US-216)', () => {
  test('/login y /api llevan la CSP estricta y las cabeceras de endurecimiento sin sesión [US-216 AC-1]', async ({
    request,
  }) => {
    const login = await request.get('/login');
    const api = await request.post('/api/auth/login', { data: {} });

    for (const respuesta of [login, api]) {
      exigirCspEstricta(csp(respuesta));
      exigirEndurecimiento(respuesta);
    }
  });

  test('/pacientes, el Route Handler del caso y un estático llevan las cabeceras cuando hay sesión [US-216 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);

    const pagina = await page.request.get(`/pacientes/${ID_SEMILLA_A}/analisis`);
    const caso = await page.request.get(`/api/patients/${ID_SEMILLA_A}/case`);
    const ruta = (await page.content()).match(/\/_next\/static\/[^"']+\.js/)?.[0] ?? '';
    const estatico = await page.request.get(ruta);

    expect(ruta).not.toBe('');
    for (const respuesta of [pagina, caso]) exigirCspEstricta(csp(respuesta));
    for (const respuesta of [pagina, caso, estatico]) exigirEndurecimiento(respuesta);
    expect(pagina.headers()['cache-control']).toBe('no-store');
  });

  test('el nonce cambia en cada request y lo llevan todos los script del HTML, sin violaciones en consola [US-216 AC-1]', async ({
    page,
    request,
  }) => {
    const violaciones = recogerViolacionesDeCsp(page);
    const a = await request.get('/login');
    const b = await request.get('/login');
    expect(nonceDe(csp(a))).not.toBe('');
    expect(nonceDe(csp(a))).not.toBe(nonceDe(csp(b)));

    const respuesta = await page.goto('/login');
    const nonce = nonceDe(csp(respuesta!));
    const html = await respuesta!.text();
    const etiquetas = html.match(/<script\b[^>]*>/g) ?? [];
    expect(etiquetas.length).toBeGreaterThan(0);
    for (const etiqueta of etiquetas) expect(etiqueta).toContain(`nonce="${nonce}"`);
    await page.waitForLoadState('networkidle');
    expect(violaciones).toEqual([]);
  });

  test('sin sesión, /pacientes redirige a /login sin la ruta original y con la CSP [US-216 AC-1] [RN-10]', async ({
    page,
  }) => {
    const respuesta = await page.goto(`/pacientes/${ID_SEMILLA_A}/analisis`);

    expect(page.url()).toMatch(/\/login$/);
    expect(page.url()).not.toContain(ID_SEMILLA_A);
    exigirCspEstricta(csp(respuesta!));
  });

  test('un origen ajeno no puede enmarcar /login ni /pacientes [US-216 AC-2]', async ({
    page,
    baseURL,
  }) => {
    // El bloqueo por frame-ancestors no llega a la consola de la página: se comprueba que el frame quedó en la
    // página de error del navegador y no en una URL de web.
    await page.route(`${ORIGEN_AJENO}/**`, (ruta) =>
      ruta.fulfill({
        contentType: 'text/html',
        body: `<iframe id="login" src="${baseURL}/login"></iframe><iframe id="pacientes" src="${baseURL}/pacientes"></iframe>`,
      }),
    );

    await page.goto(`${ORIGEN_AJENO}/`);
    await page.waitForLoadState('networkidle');

    const frames = page.frames().filter((f) => f !== page.mainFrame());
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.url()).not.toContain(baseURL ?? '');
      await expect(frame.getByLabel('Correo electrónico')).toHaveCount(0);
    }
  });
});
