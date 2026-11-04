import { expect, test, type Page } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import { ID_SEMILLA_F, ejemplo, iniciarSesion, textos } from './soporte';

const { caso } = es;
const pregunta = ejemplo('rag-query-request-fx-t3-a.json').query as string;
/** Etiqueta del dato crítico que FX-T3-a no tiene (`label.es` del catálogo); el aviso la lista tal cual. */
const FALTANTE = 'Estado menopáusico';
const DIALOGOS = '[role="dialog"], [role="alertdialog"], dialog[open]';

/** Abre el panel de FX-T3-a (paciente semilla (f)) y comprueba que el aviso previo lista el faltante sin bloquear. */
async function abrirElPanelConElAviso(page: Page) {
  await iniciarSesion(page);
  await page.goto(`/pacientes/${ID_SEMILLA_F}/analisis`);
  await expect(page.getByRole('status').filter({ hasText: FALTANTE })).toBeVisible();
}

/** Pulsa «Analizar evidencia» con la pregunta de FX-T3-a y devuelve los cuerpos de los POST de análisis. */
async function analizarConAviso(page: Page): Promise<string[]> {
  const cuerpos: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/evidence-analyses'))
      cuerpos.push(r.postData() ?? '');
  });
  const boton = page.getByRole('button', { name: 'Analizar evidencia' });
  await expect(boton).toBeEnabled();
  await page.getByLabel('Pregunta clínica').fill(pregunta);
  await boton.click();
  await expect(page.getByTestId('analysis-result')).toBeVisible();
  return cuerpos;
}

test.describe('Los avisos clínicos no bloquean (L1D-196, RN-26)', () => {
  test.setTimeout(60_000);

  test('ejecuta el análisis y muestra el resultado cuando el doctor continúa con el aviso de faltantes de FX-T3-a [US-071 AC-2]', async ({
    page,
  }) => {
    await abrirElPanelConElAviso(page);

    const cuerpos = await analizarConAviso(page);

    expect(cuerpos).toHaveLength(1);
    expect(JSON.parse(cuerpos[0]!).continueWithWarning).toBe(true);
  });

  test('muestra la opción con la etiqueta Población no comparable y sin ocultarla cuando se renderiza el análisis de FX-T3-a [US-071 AC-3]', async ({
    page,
  }) => {
    await abrirElPanelConElAviso(page);
    await analizarConAviso(page);

    const opcion = page
      .getByRole('list', { name: textos.resultado.encabezado })
      .getByRole('article')
      .first();
    await expect(opcion).toBeVisible();
    await expect(opcion.getByText(textos.aplicabilidad.etiquetaNoComparable).first()).toBeVisible();
    await expect(opcion.getByRole('heading', { level: 3 })).toBeVisible();
  });

  test('llega al resultado sin ningún dialog ni alertdialog cuando recorre login, ficha, vista de caso, faltantes y panel con FX-T3-a [US-071 AC-5]', async ({
    page,
  }) => {
    const nativos: string[] = [];
    page.on('dialog', (dialogo) => {
      nativos.push(dialogo.type());
      void dialogo.dismiss();
    });
    const sinDialogos = async () => expect(page.locator(DIALOGOS)).toHaveCount(0);

    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_SEMILLA_F}`);
    await sinDialogos();

    await page.getByRole('link', { name: caso.verCaso }).click();
    await expect(page).toHaveURL(new RegExp(`/pacientes/${ID_SEMILLA_F}/caso$`));
    await expect(page.getByRole('region', { name: caso.secciones.lineaDeTiempo })).toBeVisible();
    await sinDialogos();

    await page.getByRole('link', { name: caso.analizar }).click();
    await expect(page).toHaveURL(new RegExp(`/pacientes/${ID_SEMILLA_F}/analisis$`));
    await expect(page.getByRole('status').filter({ hasText: FALTANTE })).toBeVisible();
    await sinDialogos();

    await analizarConAviso(page);

    await expect(page.getByTestId('analysis-result')).toBeVisible();
    await sinDialogos();
    expect(nativos).toEqual([]);
  });
});
