import { expect, test } from '@playwright/test';
import { ficha, ID_SEMILLA_A, iniciarSesion } from './soporte';

test.describe('Ficha mínima del paciente (L1D-72)', () => {
  test('muestra el diagnóstico vigente, los biomarcadores y SINTÉTICO del paciente semilla (a) [US-051 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Prueba Sintética 1' })).toBeVisible();
    await expect(page.getByText('SINTÉTICO').first()).toBeVisible();
    const diagnostico = page.getByRole('region', { name: ficha.diagnostico.titulo });
    await expect(diagnostico).toContainText('mama');
    await expect(diagnostico).toContainText('TNM_8 IIA');
    await expect(diagnostico).toContainText('ECOG 1');
    const biomarcadores = page.getByRole('region', { name: ficha.biomarcadores.titulo });
    await expect(biomarcadores).toContainText('HER2');
    await expect(biomarcadores).toContainText('3+');
    await expect(page.getByRole('link', { name: ficha.acciones.analizar })).toBeVisible();
  });

  test('muestra "Carga inicial" y el estado de revisión en texto en cada dato [US-051 AC-5]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}`);

    const diagnostico = page.getByRole('region', { name: ficha.diagnostico.titulo });
    await expect(diagnostico).toContainText(ficha.origen.seed);
    await expect(diagnostico).toContainText(/verificado/i);
    await expect(
      page
        .getByRole('region', { name: ficha.biomarcadores.titulo })
        .getByText(ficha.origen.seed)
        .first(),
    ).toBeVisible();
  });

  test('muestra "Paciente no encontrado" y conserva la navegación cuando el paciente no existe [US-051 AC-2]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto('/pacientes/00000000-0000-4000-8000-000000000000');

    await expect(page.getByRole('heading', { name: ficha.noEncontrado.titulo })).toBeVisible();
    await page.getByRole('link', { name: ficha.noEncontrado.volver }).click();
    await expect(page).toHaveURL(/\/pacientes$/);
  });
});
