import { expect, test, type Page } from '@playwright/test';
import { ejemplo, ID_SEMILLA_A, ID_SEMILLA_D, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso, datosCriticos, ficha } = es;
const { biomarcador } = es.registroManual;
const TIEMPO_MAXIMO = 60_000;

const columna = (page: Page) => page.getByRole('region', { name: datosCriticos.titulo });
const fila = (page: Page, etiqueta: string) =>
  columna(page).getByRole('listitem').filter({ hasText: etiqueta });

/** El checklist de F-M2 (12 ítems, 6 faltantes) sale del ejemplo del contrato: la columna lo lee por `/api/*` de web. */
async function conChecklistDeFM2(page: Page) {
  await page.route('**/api/patients/*/completeness', (ruta) =>
    ruta.fulfill({ json: ejemplo('completeness-f-m2.json') }),
  );
}

test.describe('Columna «Datos críticos» de la vista de caso (L1D-96)', () => {
  test.setTimeout(TIEMPO_MAXIMO);

  test('muestra 12 filas con 6 Faltante, la versión del catálogo y la nota de que no bloquean [US-004 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await conChecklistDeFM2(page);

    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);

    await expect(columna(page).getByRole('listitem')).toHaveCount(12);
    await expect(
      columna(page).getByRole('listitem').filter({ hasText: datosCriticos.estado.faltante }),
    ).toHaveCount(6);
    await expect(columna(page)).toContainText('test-1.0.0');
    await expect(columna(page)).toContainText(datosCriticos.nota);
  });

  test('registra Ki-67 a mano desde su fila y la fila deja de ser Faltante sin recargar la página [US-004 AC-3]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_D}/caso`);
    await expect(fila(page, 'Ki-67')).toContainText(datosCriticos.estado.faltante);
    await expect(fila(page, 'Estado menopáusico')).not.toContainText('Cargar documento');
    const urls: string[] = [];
    page.on('request', (peticion) => urls.push(peticion.url()));
    await page.evaluate(() => {
      (window as unknown as { marcaDeRecarga: boolean }).marcaDeRecarga = true;
    });

    await columna(page).getByRole('link', { name: 'Registrar a mano Ki-67' }).click();
    const dialogo = page.getByRole('dialog', { name: biomarcador.titulo });
    await expect(dialogo.getByLabel(biomarcador.nombre)).toHaveValue('Ki-67');
    await dialogo.getByLabel(biomarcador.valor).fill('20');
    await dialogo.getByLabel(biomarcador.unidad).fill('%');
    await dialogo.getByLabel(biomarcador.tipoDeResultado).selectOption('cuantitativo');
    await dialogo.getByLabel(biomarcador.fecha).fill('2026-01-15');
    await dialogo.getByRole('button', { name: caso.registro.guardar }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(fila(page, 'Ki-67')).toContainText(datosCriticos.estado.presente_verificado);
    await expect(fila(page, 'Ki-67')).toContainText(ficha.origen.manual);
    await expect(fila(page, 'Ki-67')).not.toContainText(datosCriticos.estado.faltante);
    expect(
      await page.evaluate(() => (window as unknown as { marcaDeRecarga?: boolean }).marcaDeRecarga),
    ).toBe(true);
    const origen = new URL(page.url()).origin;
    expect(urls.filter((u) => new URL(u).origin !== origen)).toEqual([]);
    expect(urls.filter((u) => /clinical-api|rag-orchestrator/.test(u))).toEqual([]);
  });

  test('muestra No se pudo calcular el checklist y la vista completa cuando el checklist responde 500 [US-004 AC-5]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.route('**/api/patients/*/completeness', (ruta) =>
      ruta.fulfill({ status: 500, json: ejemplo('error-interno.json') }),
    );

    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);

    await expect(columna(page)).toContainText(datosCriticos.noCalculable);
    await expect(columna(page).getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('region', { name: caso.secciones.lineaDeTiempo })).toBeVisible();
    await expect(page.getByRole('region', { name: caso.secciones.tratamientos })).toBeVisible();
  });

  test('recorre las acciones con Tab en orden y abre una con Enter [US-004 AC-6]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await conChecklistDeFM2(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);
    const grado = columna(page).getByRole('link', {
      name: `${datosCriticos.acciones.completarDiagnostico} Grado`,
    });
    const progesterona = columna(page).getByRole('link', {
      name: `${datosCriticos.acciones.registrarAMano} Receptor de progesterona`,
    });
    await expect(grado).toBeVisible();

    await grado.focus();
    await page.keyboard.press('Tab');

    await expect(progesterona).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/caso\?item=rp$/);
  });
});
