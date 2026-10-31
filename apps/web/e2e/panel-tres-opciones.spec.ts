import { checkProhibitedTerms, loadProhibitedTerms } from '@oncolens/clinical-language';
import { expect, test } from '@playwright/test';
import { analizar, ejemplo, textos } from './soporte';

const pregunta = ejemplo('rag-query-request-tres-opciones.json').query as string;
const respuesta = ejemplo('rag-query-tres-opciones.json');
const lista = loadProhibitedTerms();
const DISCLAIMER =
  'Generado por IA; requiere validación clínica independiente por el oncólogo tratante';

test.describe('Panel de tres opciones (L1D-145)', () => {
  test.setTimeout(60_000);

  test('muestra 3 tarjetas en el orden recibido con conteos, citas y relevancia al final [US-135 AC-1]', async ({
    page,
  }) => {
    await analizar(page, pregunta);
    await expect(
      page.getByRole('heading', { level: 2, name: textos.resultado.encabezado }),
    ).toBeVisible();

    const tarjetas = page
      .getByRole('list', { name: textos.resultado.encabezado })
      .getByRole('article');
    await expect(tarjetas).toHaveCount(3);
    for (const [i, opcion] of respuesta.evidenceOptions.entries()) {
      const tarjeta = tarjetas.nth(i);
      await expect(tarjeta.getByRole('heading', { level: 3 })).toHaveText(opcion.option);
      await expect(tarjeta.getByText(`Opción descrita ${i + 1} de 3`)).toBeVisible();
      await expect(tarjeta.getByRole('group', { name: /Coincide \d+, Parcial/ })).toBeVisible();
      await expect(tarjeta.getByTestId('relevance-basis')).toHaveText(textos.relevance.basis);
    }
  });

  test('no encuentra términos prohibidos ni rótulos de jerarquía y conserva el aviso de IA [US-135 AC-3] [RN-23] [RN-19]', async ({
    page,
  }) => {
    await analizar(page, pregunta);
    const panel = page.getByTestId('analysis-result');
    await expect(panel).toBeVisible();

    const texto = await panel.evaluate((n) => (n as HTMLElement).innerText);
    const textoDelPanel = texto.split('\n').filter((linea) => linea.trim().length > 0);
    const hallazgos = textoDelPanel.flatMap((t) =>
      checkProhibitedTerms(t, lista, { niveles: ['A'] }).map((c) => `${c.termino}: ${t}`),
    );
    expect(hallazgos).toEqual([]);
    expect(texto).not.toMatch(/mejor opción|primera elección|preferida/i);
    await expect(page.getByRole('note').first()).toContainText(DISCLAIMER);
  });
});
