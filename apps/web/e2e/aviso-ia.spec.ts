import { expect, test, type Page } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import { analizar, ejemplo, esperarResultado, iniciarSesion } from './soporte';

const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;
const disclaimerPorDefecto = ejemplo('con-evidencia-s1.json').disclaimer as string;
const ETIQUETA = es.app.academicUseLabel;

/** Valor de AI_DISCLAIMER_TEXT con el que se arrancó Compose; sin él, el literal por defecto del contrato. */
const disclaimerEsperado = process.env.AI_DISCLAIMER_TEXT ?? disclaimerPorDefecto;

async function avisosDelResultado(page: Page) {
  return page.getByTestId('analysis-result').getByRole('note').allTextContents();
}

test.describe('Aviso de IA y etiqueta académica (L1D-194)', () => {
  test('muestra el disclaimer de la respuesta en una región note junto al resultado cuando el análisis es con_evidencia [US-069 AC-1]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    const avisos = await avisosDelResultado(page);
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos) expect(aviso).toBe(disclaimerPorDefecto);
  });

  test('muestra el aviso cuando el análisis es sin_evidencia [US-069 AC-4]', async ({ page }) => {
    await analizar(page, preguntaSinEvidencia);
    await esperarResultado(page);

    const avisos = await avisosDelResultado(page);
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos) expect(aviso).toBe(disclaimerPorDefecto);
  });

  test('muestra el valor sintético de AI_DISCLAIMER_TEXT en el panel sin cambiar código de web [US-069 AC-2]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    for (const aviso of await avisosDelResultado(page)) expect(aviso).toBe(disclaimerEsperado);
  });

  test(`muestra ${ETIQUETA} en la cabecera de cada página autenticada del S1 fuera del aviso de IA [US-069 AC-3]`, async ({
    page,
  }) => {
    await iniciarSesion(page);
    const cabecera = page.getByRole('banner');
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();

    await page.getByLabel('Pregunta clínica').fill(preguntaHer2);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();
    await esperarResultado(page);
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();

    await page.getByLabel('Pregunta clínica').fill(preguntaSinEvidencia);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();
    await expect(page.getByText('Relevancia máxima: no aplica')).toBeVisible();
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();

    await page.route('**/api/evidence-analyses', (ruta) =>
      ruta.fulfill({ status: 502, json: ejemplo('error-servicio-ia.json') }),
    );
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();
    await expect(page.getByText(/Código de traza:/)).toBeVisible();
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();
    for (const aviso of await page.getByRole('note').allTextContents()) {
      expect(aviso).not.toContain(ETIQUETA);
    }
  });
});
