import { expect, test } from '@playwright/test';
import { iniciarSesion, pacientes } from './soporte';

test.describe('Listado y búsqueda de pacientes (L1D-202, ARR-09)', () => {
  test('muestra los cinco pacientes semilla, cada uno con SINTÉTICO [US-048 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto('/pacientes');

    await expect(page.getByRole('heading', { level: 1, name: pacientes.titulo })).toBeVisible();
    const filas = page.getByRole('row').filter({ has: page.getByRole('rowheader') });
    await expect(filas).toHaveCount(5);
    for (let n = 1; n <= 5; n += 1) {
      await expect(page.getByRole('link', { name: new RegExp(`P\\. S\\. ${n}\\.`) })).toBeVisible();
    }
    await expect(filas.filter({ hasText: 'SINTÉTICO' })).toHaveCount(5);
  });

  test('no muestra JSON crudo ni mueve la identidad a la URL si la búsqueda se envía antes de hidratar [ARR-09 AC-3]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    // Sin los chunks de Next la página nunca hidrata: es el estado previo a la hidratación, fijo y reproducible.
    await page.route('**/_next/static/**', (ruta) => ruta.abort());
    await page.goto('/pacientes');

    const boton = page.getByRole('button', { name: pacientes.busqueda.cargando });
    await expect(boton).toBeDisabled();
    await page.getByLabel(pacientes.busqueda.numero).fill('SINT-0000001');
    await page.getByLabel(pacientes.busqueda.numero).press('Enter');

    // Señal positiva tras el Enter: el envío no ocurrió y el formulario sigue sin hidratar y deshabilitado.
    await expect(boton).toBeDisabled();
    await expect(page.getByLabel(pacientes.busqueda.numero)).toHaveValue('SINT-0000001');
    await expect(page).toHaveURL(/\/pacientes$/);
    await expect(page.getByRole('heading', { level: 1, name: pacientes.titulo })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('"items"');
    expect(page.url()).not.toContain('SINT-');
  });
});
