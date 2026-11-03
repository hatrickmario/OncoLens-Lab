import { expect, test, type Page } from '@playwright/test';
import { ejemplo, ficha, ID_SEMILLA_A, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso } = es;
const RUTA_DEL_CASO = `/api/patients/${ID_SEMILLA_A}/case`;

async function abrirElCasoDesdeLaFicha(page: Page) {
  await iniciarSesion(page);
  await page.goto(`/pacientes/${ID_SEMILLA_A}`);
  await page.getByRole('link', { name: caso.verCaso }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${ID_SEMILLA_A}/caso$`));
}

test.describe('Vista de caso (L1D-76)', () => {
  test('llega desde la ficha y muestra el diagnóstico sembrado con Carga inicial en la línea de tiempo [US-090 AC-1]', async ({
    page,
  }) => {
    await abrirElCasoDesdeLaFicha(page);

    for (const seccion of [caso.secciones.lineaDeTiempo, caso.secciones.tratamientos]) {
      await expect(page.getByRole('region', { name: seccion })).toBeVisible();
    }
    const linea = page.getByRole('region', { name: caso.secciones.lineaDeTiempo });
    await expect(linea).toContainText(caso.tiposDeEvento.diagnostico);
    await expect(linea).toContainText(ficha.origen.seed);
    await expect(page.getByRole('link', { name: caso.analizar })).toBeVisible();
  });

  test('muestra la línea de tiempo con 10 eventos y la toxicidad en Sin fecha confiable con el CaseView de P-CASO [US-090 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.route(`**${RUTA_DEL_CASO}`, (ruta) =>
      ruta.fulfill({ json: ejemplo('case-view-p-caso.json') }),
    );
    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);

    const linea = page.getByRole('region', { name: caso.secciones.lineaDeTiempo });
    await expect(linea.getByRole('listitem')).toHaveCount(10);
    await expect(
      page.getByRole('region', { name: caso.secciones.sinFecha }).getByRole('listitem'),
    ).toHaveCount(1);
    await expect(page.getByRole('table', { name: 'PSA' }).getByRole('row')).toHaveCount(4);
    await expect(linea).toContainText(caso.origenIa);
    await expect(page.getByText(/Ver documento/)).toHaveCount(0);
  });

  test('hace solo peticiones al origen de web y sin identidad en la URL al cargar y reintentar [US-090 AC-5]', async ({
    page,
  }) => {
    await abrirElCasoDesdeLaFicha(page);
    const origen = new URL(page.url()).origin;
    const urls: string[] = [];
    page.on('request', (peticion) => urls.push(peticion.url()));

    await page.reload();
    await expect(page.getByRole('region', { name: caso.secciones.lineaDeTiempo })).toBeVisible();

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => new URL(u).origin !== origen)).toEqual([]);
    expect(urls.filter((u) => u.includes('/case')).map((u) => new URL(u).pathname)).toEqual([
      RUTA_DEL_CASO,
    ]);
    expect(
      urls.filter((u) => /Sint%C3%A9tica|Sintética|Prueba/.test(decodeURIComponent(u))),
    ).toEqual([]);
  });

  test('muestra No se pudo cargar la vista de caso con Reintentar y recupera la vista cuando el servidor se recupera [US-090 AC-6]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    let peticiones = 0;
    await page.route(`**${RUTA_DEL_CASO}`, (ruta) => {
      peticiones += 1;
      return ruta.fulfill({ status: 500, json: ejemplo('error-interno.json') });
    });
    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);

    await expect(page.getByText(caso.error.titulo)).toBeVisible();
    await expect(page.getByText(ejemplo('error-interno.json').message)).toHaveCount(0);
    await expect(page.getByRole('region')).toHaveCount(0);

    await page.unroute(`**${RUTA_DEL_CASO}`);
    await page.getByRole('button', { name: caso.error.reintentar }).click();

    await expect(page.getByRole('region', { name: caso.secciones.lineaDeTiempo })).toBeVisible();
    expect(peticiones).toBe(1);
  });
});
