import { expect, test, type Page } from '@playwright/test';
import { ID_SEMILLA_A, iniciarSesion } from './soporte';
import es from '../messages/es.json' with { type: 'json' };

const { caso, ficha } = es;
const { biomarcador } = es.registroManual;

/** Recoge las URL del navegador desde ya; al final solo debe haber el origen de `web`, y las llamadas, de `/api/*`. */
function recogerPeticiones(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (peticion) => urls.push(peticion.url()));
  return urls;
}

function comprobarSoloElOrigenDeWeb(page: Page, urls: string[]) {
  const origen = new URL(page.url()).origin;
  expect(urls.filter((u) => new URL(u).origin !== origen)).toEqual([]);
  expect(urls.filter((u) => /clinical-api|rag-orchestrator/.test(u))).toEqual([]);
  expect(urls.filter((u) => /\/api\//.test(u)).length).toBeGreaterThan(0);
}

test.describe('Formularios de registro manual del biomarcador y el diagnóstico (L1D-91)', () => {
  test('registra Ki-67 desde la vista de caso y aparece en la ficha y en la vista con origen Registro manual sin recargar [US-111 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso`);
    await expect(page.getByRole('region', { name: caso.secciones.series })).toBeVisible();
    const urls = recogerPeticiones(page);
    await page.evaluate(() => {
      (window as unknown as { marcaDeRecarga: boolean }).marcaDeRecarga = true;
    });

    const disparador = page.getByRole('button', { name: biomarcador.accion });
    await disparador.click();
    const dialogo = page.getByRole('dialog', { name: biomarcador.titulo });
    await dialogo.getByLabel(biomarcador.nombre).fill('Ki-67');
    await dialogo.getByLabel(biomarcador.valor).fill('20');
    await dialogo.getByLabel(biomarcador.unidad).fill('%');
    await dialogo.getByLabel(biomarcador.tipoDeResultado).selectOption('cuantitativo');
    await dialogo.getByLabel(biomarcador.fecha).fill('2026-01-15');
    await dialogo.getByRole('button', { name: caso.registro.guardar }).click();

    const serie = page.getByRole('table', { name: 'Ki-67' });
    await expect(serie).toContainText('20 %');
    await expect(serie).toContainText(ficha.origen.manual);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(disparador).toBeFocused();
    expect(
      await page.evaluate(() => (window as unknown as { marcaDeRecarga?: boolean }).marcaDeRecarga),
    ).toBe(true);
    comprobarSoloElOrigenDeWeb(page, urls);

    await page.goto(`/pacientes/${ID_SEMILLA_A}`);
    await expect(
      page
        .getByRole('region', { name: ficha.biomarcadores.titulo })
        .getByRole('row', { name: new RegExp(`Ki-67.*${ficha.origen.manual}`) }),
    ).toBeVisible();
  });

  test('?item=ki67 abre el formulario con Ki-67 seleccionado y el foco en el valor [US-111 AC-2]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    const urls = recogerPeticiones(page);

    await page.goto(`/pacientes/${ID_SEMILLA_A}/caso?item=ki67`);

    const dialogo = page.getByRole('dialog', { name: biomarcador.titulo });
    await expect(dialogo.getByLabel(biomarcador.nombre)).toHaveValue('Ki-67');
    await expect(dialogo.getByLabel(biomarcador.valor)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/item=/);
    await expect(page.getByRole('heading', { name: caso.secciones.series })).toBeFocused();
    comprobarSoloElOrigenDeWeb(page, urls);
  });
});
