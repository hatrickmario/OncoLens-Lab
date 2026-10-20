import { expect, test } from '@playwright/test';
import { analizar, ejemplo, esperarResultado, iniciarSesion } from './soporte';

const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const RUTA_PACIENTE =
  process.env.WEB_HOME_PATH ?? '/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis';

test.describe('Sesión y origen único en el navegador (ARR-02)', () => {
  test('la cookie de sesión es HttpOnly, Secure y SameSite=Strict cuando el médico inicia sesión [US-211 AC-1]', async ({
    page,
    context,
  }) => {
    await iniciarSesion(page);

    const sesion = (await context.cookies()).find((c) => c.name === 'oncolens_session');
    expect(sesion).toBeDefined();
    expect(sesion).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('oncolens_session');
  });

  test('redirige a /login sin mostrar datos del paciente cuando no hay sesión [US-211 AC-4]', async ({
    page,
  }) => {
    await page.goto(RUTA_PACIENTE);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByText(/Paciente · ID/)).toHaveCount(0);
  });

  test('el navegador solo habla con el origen de web durante el login y el análisis [US-060 AC-3]', async ({
    page,
    baseURL,
  }) => {
    const origenWeb = new URL(baseURL ?? 'http://127.0.0.1:3000').origin;
    const origenes = new Set<string>();
    page.on('request', (peticion) => {
      const url = new URL(peticion.url());
      if (url.protocol === 'http:' || url.protocol === 'https:') origenes.add(url.origin);
    });

    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    expect([...origenes]).toEqual([origenWeb]);
  });
});
