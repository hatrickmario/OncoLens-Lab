import { expect, test, type Page } from '@playwright/test';
import { ID_SEMILLA_A, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso } = es;
const { registro } = caso;

async function abrirElCaso(page: Page) {
  await iniciarSesion(page);
  await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);
  await expect(page.getByRole('region', { name: caso.secciones.tratamientos })).toBeVisible();
}

test.describe('Registro manual de tratamientos y atributos en la vista de caso (L1D-80)', () => {
  test('el tratamiento y el atributo registrados aparecen en su sección sin recargar y solo hay peticiones a /api/* del mismo origen [US-094 AC-6]', async ({
    page,
  }) => {
    await abrirElCaso(page);
    const origen = new URL(page.url()).origin;
    const urls: string[] = [];
    page.on('request', (peticion) => urls.push(peticion.url()));
    await page.evaluate(() => {
      (window as unknown as { marcaDeRecarga: boolean }).marcaDeRecarga = true;
    });

    await page.getByRole('button', { name: registro.tratamiento.accion }).click();
    const tratamiento = page.getByRole('dialog', { name: registro.tratamiento.titulo });
    await tratamiento.getByLabel(registro.tratamiento.esquema).fill('Fármaco experimental X');
    await tratamiento
      .getByLabel(registro.tratamiento.contexto)
      .selectOption('segunda_linea_metastasica');
    await tratamiento.getByLabel(registro.tratamiento.enCurso).check();
    await tratamiento.getByRole('button', { name: registro.guardar }).click();
    await expect(tratamiento.getByRole('status')).toContainText(registro.tratamiento.noMapeado);
    await tratamiento.getByRole('button', { name: registro.cerrar }).click();
    await expect(
      page
        .getByRole('region', { name: caso.secciones.tratamientos })
        .getByRole('row', { name: /Fármaco experimental X/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: registro.atributo.accion }).click();
    const atributo = page.getByRole('dialog', { name: registro.atributo.titulo });
    await atributo.getByLabel(registro.atributo.atributo).selectOption('estado_menopausico');
    await atributo.getByLabel(registro.atributo.valor).selectOption('posmenopausica');
    await atributo.getByRole('button', { name: registro.guardar }).click();
    await expect(
      page
        .getByRole('region', { name: caso.secciones.atributos })
        .getByRole('row', { name: /Posmenopáusica/ }),
    ).toBeVisible();

    expect(
      await page.evaluate(() => (window as unknown as { marcaDeRecarga?: boolean }).marcaDeRecarga),
    ).toBe(true);
    const llamadas = urls.filter((u) => /\/api\//.test(u));
    expect(llamadas.length).toBeGreaterThan(0);
    expect(urls.filter((u) => new URL(u).origin !== origen)).toEqual([]);
    expect(urls.filter((u) => /clinical-api|rag-orchestrator/.test(u))).toEqual([]);
  });
});
