import { expect, test } from '@playwright/test';
import { analizar, ejemplo, esperarResultado, iniciarSesion, textos } from './soporte';

const respuestaConEvidencia = ejemplo('rag-query-con-evidencia.json');
const cita = respuestaConEvidencia.evidenceOptions[0].citedSources[0];
const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSoloDescartadas = ejemplo('rag-query-request-solo-descartadas.json').query as string;
const preguntaSinOpciones = ejemplo('rag-query-request-sin-opciones.json').query as string;
const descartada = ejemplo('rag-query-solo-descartadas.json').discardedOptions[0];

test.describe('Panel de análisis (L1D-140)', () => {
  test('muestra la opción, su justificación y la cita en idioma original sin cambiar de URL [US-061 AC-1]', async ({
    page,
  }) => {
    const peticiones: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && peticiones.push(r.url()));
    await iniciarSesion(page);
    const url = page.url();
    await page.getByLabel('Pregunta clínica').fill(preguntaHer2);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: textos.resultado.encabezado }),
    ).toBeVisible();
    const opcion = respuestaConEvidencia.evidenceOptions[0];
    await expect(page.getByRole('heading', { level: 3, name: opcion.option })).toBeVisible();
    await expect(page.getByText(opcion.rationale)).toBeVisible();
    const chip = page.getByRole('button', {
      name: new RegExp(`${cita.sourceName}.*${cita.externalId}`),
    });
    await expect(chip).toBeVisible();
    await chip.click();
    await page.getByRole('button', { name: textos.cita.verFragmento }).click();
    const fragmento = page.getByText(cita.chunkTextSnapshot);
    await expect(fragmento).toHaveAttribute('lang', cita.language);
    expect(page.url()).toBe(url);
    expect(peticiones.filter((u) => u.endsWith('/api/evidence-analyses'))).toHaveLength(1);
  });

  test('muestra la relevancia como metadato secundario después de las citas [US-061 AC-2]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    await expect(page.getByTestId('relevance-label')).toHaveText(textos.relevance.label);
    await expect(page.getByTestId('relevance-value')).toHaveText('0,87');
    await expect(page.getByTestId('relevance-basis')).toHaveText(textos.relevance.basis);
    await expect(page.getByTestId('relevance-help')).toHaveText(textos.relevance.help);
    const [citas, relevancia] = await Promise.all([
      page.getByRole('list', { name: textos.cita.lista }).boundingBox(),
      page.getByTestId('relevance-label').boundingBox(),
    ]);
    expect(relevancia!.y).toBeGreaterThan(citas!.y);
  });

  test('muestra el criterio por relevancia de recuperación y no el de aplicabilidad [US-061 AC-3]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    await expect(page.getByText(textos.orderCriterion.relevance, { exact: true })).toBeVisible();
    await expect(page.getByText(/Ordenadas por coincidencia con la población/)).toHaveCount(0);
  });

  test('pliega las descartadas y muestra la auditoría al expandir cuando solo hay descartadas [US-061 AC-4]', async ({
    page,
  }) => {
    await analizar(page, preguntaSoloDescartadas);
    await esperarResultado(page);

    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0);
    const titulo = page.getByRole('button', { name: textos.discarded.titulo });
    await expect(titulo).toHaveAttribute('aria-expanded', 'false');
    await titulo.click();
    await expect(page.getByText(descartada.option)).toBeVisible();
    await expect(page.getByText(textos.discardReason.afirmacion_sin_soporte)).toBeVisible();
    await expect(page.getByText(descartada.unsupportedClaims[0])).toBeVisible();
    await expect(page.getByText(textos.discarded.auditoria)).toBeVisible();
    const meta = page.getByTestId('discarded-audit-meta');
    await expect(meta).toContainText('N.º 1');
    await expect(meta).toContainText(/Análisis [0-9a-f-]{36}/);
  });

  test('no muestra encabezado de opciones ni descartadas cuando la pregunta no es terapéutica [US-061 AC-5]', async ({
    page,
  }) => {
    await analizar(page, preguntaSinOpciones);
    await esperarResultado(page);

    await expect(page.getByText(textos.resultado.sinOpciones)).toBeVisible();
    await expect(page.getByRole('heading', { name: textos.resultado.encabezado })).toHaveCount(0);
    await expect(page.getByText(textos.discarded.titulo)).toHaveCount(0);
  });

  test('se opera solo con teclado y el resultado se anuncia en role=status sin mover el foco [US-061 AC-6]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    const campo = page.getByLabel('Pregunta clínica');
    await campo.focus();
    await page.keyboard.type(preguntaHer2);
    await page.keyboard.press('Tab');
    const boton = page.getByRole('button', { name: 'Analizar evidencia' });
    await expect(boton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toHaveText(textos.estado.listoUna);
    await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await expect(boton).toBeFocused();
  });
});
