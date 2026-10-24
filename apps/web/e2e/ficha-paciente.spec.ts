import { expect, test } from '@playwright/test';
import { iniciarSesion } from './soporte';

const ID_SEMILLA_A = '0fd028e2-f8b0-56c7-a748-2a4e473d879d';

test.describe('Ficha mínima del paciente (L1D-72)', () => {
  test('muestra el diagnóstico vigente, los biomarcadores y SINTÉTICO del paciente semilla (a) [US-051 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Prueba Sintética 1' })).toBeVisible();
    await expect(page.getByText('SINTÉTICO').first()).toBeVisible();
    const diagnostico = page.getByRole('region', { name: 'Diagnóstico vigente' });
    await expect(diagnostico).toContainText('mama');
    await expect(diagnostico).toContainText('TNM_8 IIA');
    await expect(diagnostico).toContainText('ECOG 1');
    const biomarcadores = page.getByRole('region', { name: 'Biomarcadores recientes' });
    await expect(biomarcadores).toContainText('HER2');
    await expect(biomarcadores).toContainText('3+');
    await expect(page.getByRole('link', { name: 'Analizar evidencia' })).toBeVisible();
  });

  test('muestra "Carga inicial" y el estado de revisión en texto en cada dato [US-051 AC-5]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}`);

    const diagnostico = page.getByRole('region', { name: 'Diagnóstico vigente' });
    await expect(diagnostico).toContainText('Carga inicial');
    await expect(diagnostico).toContainText(/verificado/i);
    await expect(
      page
        .getByRole('region', { name: 'Biomarcadores recientes' })
        .getByText(/Carga inicial/)
        .first(),
    ).toBeVisible();
  });

  test('muestra "Paciente no encontrado" y conserva la navegación cuando el paciente no existe [US-051 AC-2]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto('/pacientes/00000000-0000-4000-8000-000000000000');

    await expect(page.getByRole('heading', { name: 'Paciente no encontrado' })).toBeVisible();
    await page.getByRole('link', { name: /volver/i }).click();
    await expect(page).toHaveURL(/\/pacientes$/);
  });
});
