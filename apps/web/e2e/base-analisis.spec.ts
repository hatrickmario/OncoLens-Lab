import { expect, test } from '@playwright/test';
import { analizar, ejemplo, esperarResultado, SIN_BASE } from './soporte';

const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;

test.describe('Base del análisis (L1D-187)', () => {
  test.setTimeout(60_000);

  // US-005 AC-2: la UI envía continueWithWarning=true con faltantes, así que la Base añade «continuó con aviso» (US-128 AC-1/AC-4 + US-005 AC-2).
  // Desviación: Compose monta el catálogo real y el seed no incluye F-M2 (seis faltantes de test-1.0.0); el recorrido
  // comprueba que el contador del resumen coincide con las etiquetas del detalle del paciente semilla (a).
  test('dice N datos críticos faltantes con continuó con aviso y lista N etiquetas cuando la UI analiza el paciente semilla [US-128 AC-4]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    const resumen = page.getByText(
      /^(\d+) datos críticos faltantes · continuó con aviso · Supuestos: \d+ · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0$/,
    );
    await expect(resumen).toBeVisible();
    const cuenta = Number((await resumen.innerText()).match(/^(\d+) /)?.[1]);
    expect(cuenta).toBeGreaterThan(0);
    await expect(page.getByText(/aún no se calculan/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Ver detalle de la Base' }).click();
    const bloque = page
      .getByRole('heading', { level: 4, name: 'Datos críticos faltantes' })
      .locator('..');
    await expect(bloque.getByText('Solo informa; no bloquea el análisis')).toBeVisible();
    await expect(bloque.getByRole('listitem')).toHaveCount(cuenta);
  });

  test('muestra el resumen de la Base sin expandir con la fecha de corte y las fuentes no incluidas [US-067 AC-1]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    await expect(page.getByRole('heading', { level: 3, name: 'Base del análisis' })).toBeVisible();
    await expect(
      page.getByText(/Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0$/),
    ).toBeVisible();
    await expect(page.getByText(/^Evidencia del corpus al \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver detalle de la Base' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('dice qué se buscó y 0 fragmentos sobre el umbral sin expandir cuando no hay evidencia [US-067 AC-3]', async ({
    page,
  }) => {
    await analizar(page, preguntaSinEvidencia);
    await esperarResultado(page);

    await expect(
      page.getByText(/^Qué se buscó: fuentes .* · 0 fragmentos sobre el umbral$/),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: SIN_BASE })).toHaveCount(0);
  });
});
