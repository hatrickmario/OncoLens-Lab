import { expect, test } from '@playwright/test';
import { analizar, ejemplo, esperarResultado } from './soporte';

const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;

test.describe('Base del análisis (L1D-187)', () => {
  test.setTimeout(60_000);

  test('muestra el resumen de la Base sin expandir con la fecha de corte y las fuentes no incluidas [US-067 AC-1]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    await expect(page.getByRole('heading', { level: 2, name: 'Base del análisis' })).toBeVisible();
    await expect(
      page.getByText(/^Faltantes: \d+ · Supuestos: \d+ · Fuentes no incluidas: /),
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
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0);
  });
});
