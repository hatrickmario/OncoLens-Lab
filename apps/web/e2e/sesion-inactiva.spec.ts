import { expect, test } from '@playwright/test';
import { iniciarSesion } from './soporte';

/** Mismo valor con el que `scripts/e2e/ejecutar.sh` arranca clinical-api (RN-22: el plazo vive en configuración). */
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES ?? '1');
const MARGEN_SEGUNDOS = 3;

test.describe('Sesión inactiva (US-044)', () => {
  test('una sesión inactiva más de SESSION_IDLE_MINUTES lleva al login sin datos del paciente [US-044 AC-4]', async ({
    page,
  }) => {
    test.setTimeout((SESSION_IDLE_MINUTES * 60 + MARGEN_SEGUNDOS + 60) * 1000);
    await iniciarSesion(page);
    await expect(page.getByText(/Paciente · ID/)).toBeVisible();

    await page.waitForTimeout((SESSION_IDLE_MINUTES * 60 + MARGEN_SEGUNDOS) * 1000);
    await page.getByLabel('Pregunta clínica').fill('Pregunta de prueba');
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();

    await expect(page).toHaveURL(/\/login\?motivo=expirada$/);
    await expect(page.getByRole('status')).toHaveText('Tu sesión expiró. Vuelve a iniciar sesión.');
    await expect(page.getByText(/Paciente · ID/)).toHaveCount(0);
  });

  test('cerrar sesión lleva a /login?motivo=cerrada y la cookie deja de servir [US-044 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page).toHaveURL(/\/login\?motivo=cerrada$/);
    await expect(page.getByRole('status')).toHaveText('Cerraste sesión.');
    await page.goto('/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis');
    await expect(page).toHaveURL(/\/login$/);
  });
});
