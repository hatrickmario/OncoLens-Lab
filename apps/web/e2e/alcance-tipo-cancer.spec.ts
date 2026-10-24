import { expect, test } from '@playwright/test';
import { alcance, ficha, iniciarSesion } from './soporte';

// El stack del E2E corre con ENABLED_CANCER_TYPES=mama (scripts/e2e/ejecutar.sh): el paciente semilla (b) es de próstata.
test.describe('Tipos de cáncer habilitados (L1D-173)', () => {
  test('avisa que el tipo está fuera del alcance del piloto sin ocultar los datos del paciente [US-043 AC-3]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto('/pacientes');
    await page.getByRole('link', { name: /P\. S\. 2\./ }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Prueba Sintética 2' })).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: alcance.tipoNoHabilitado }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: ficha.diagnostico.titulo })).toContainText(
      'prostata',
    );
    // El aviso no bloquea (RN-26): la acción sigue disponible.
    await expect(page.getByRole('link', { name: ficha.acciones.analizar })).toBeVisible();
  });
});
