import { expect, test } from '@playwright/test';
import {
  analizar,
  ejemplo,
  esperarResultado,
  ID_SEMILLA_A,
  iniciarSesion,
  SIN_BASE,
  textos,
} from './soporte';

const respuestaConEvidencia = ejemplo('rag-query-con-evidencia.json');
const cita = respuestaConEvidencia.evidenceOptions[0].citedSources[0];
const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;
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

  test('muestra al final del Fragmento citado el enlace a la fuente original cuando la cita trae su URL [ARR-07 AC-4]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);
    await page
      .getByRole('button', { name: new RegExp(`${cita.sourceName}.*${cita.externalId}`) })
      .click();
    await page.getByRole('button', { name: textos.cita.verFragmento }).click();

    const panel = page.getByRole('complementary', { name: textos.fragmento.titulo });
    const enlace = panel.getByRole('link', { name: cita.sourceUrl });
    await expect(enlace).toHaveAttribute('href', cita.sourceUrl);
    await expect(enlace).toHaveAttribute('target', '_blank');
    await expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(panel.getByRole('button', { name: textos.fragmento.volver })).toBeVisible();
  });

  test('despliega el detalle de la opción con el teclado y muestra sus párrafos cuando la opción trae details [ARR-08 AC-5]', async ({
    page,
  }) => {
    const detalle = respuestaConEvidencia.evidenceOptions[0].details as string[];
    expect(detalle.length).toBeGreaterThanOrEqual(1);
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    const control = page.getByText(textos.detalle.resumen);
    await expect(control).toBeVisible();
    await expect(page.getByText(detalle[0]!)).toBeHidden();
    await control.focus();
    await page.keyboard.press('Enter');

    for (const parrafo of detalle) await expect(page.getByText(parrafo)).toBeVisible();
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

  test('muestra el criterio por aplicabilidad, la línea de conteos y la relevancia que solo desempata cuando la opción trae aplicabilidad calculada [US-062 AC-7]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    await expect(
      page.getByText(textos.orderCriterion.applicability, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(textos.orderCriterion.relevance, { exact: true })).toHaveCount(0);
    await expect(page.getByText(textos.aplicabilidad.prefijo)).toBeVisible();
    await expect(
      page.getByRole('group', {
        name: /^Coincide \d+, Parcial \d+, No coincide \d+, Desconocido \d+$/,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('relevance-basis')).toHaveText(textos.relevance.basis);
    await expect(page.getByText(/Ordenadas por coincidencia con la población/)).toHaveCount(0);
  });

  test('pliega las descartadas y muestra la auditoría al expandir cuando solo hay descartadas [US-061 AC-4]', async ({
    page,
  }) => {
    await analizar(page, preguntaSoloDescartadas);
    await esperarResultado(page);

    await expect(page.getByRole('heading', { level: 3, name: SIN_BASE })).toHaveCount(0);
    // US-237: el resumen por motivo vive bajo el titular, fuera de la sección plegada.
    await expect(page.getByText(textos.discarded.motivos)).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: textos.discardReason.afirmacion_sin_soporte }),
    ).toHaveCount(1);
    const titulo = page.getByRole('button', { name: textos.discarded.titulo });
    await expect(titulo).toHaveAttribute('aria-expanded', 'false');
    await titulo.click();
    await expect(page.getByText(descartada.option)).toBeVisible();
    const seccion = page.locator('#descartadas');
    await expect(seccion.getByText(textos.discardReason.afirmacion_sin_soporte)).toBeVisible();
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
    const boton = page.getByRole('button', { name: 'Analizar evidencia' });
    // Los enlaces «Registrar … en la ficha» del aviso de faltantes (US-005 AC-7) preceden al botón en el orden de Tab.
    for (let i = 0; i < 12 && !(await boton.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(boton).toBeFocused();
    await page.keyboard.press('Enter');

    // El aviso de faltantes también es role=status (US-005): se acota al anuncio del resultado.
    const anuncio = page.getByRole('status').filter({ hasText: textos.estado.listoUna });
    await expect(anuncio).toHaveText(textos.estado.listoUna);
    await expect(anuncio).toHaveAttribute('aria-live', 'polite');
    await expect(boton).toBeFocused();
  });

  test('muestra No disponible en endpoint y tamaño de muestra de la cita cuando el catálogo no los registra [US-127 AC-3]', async ({
    page,
  }) => {
    expect(cita.primaryEndpoint).toBeNull();
    expect(cita.sampleSize).toBeNull();
    await analizar(page, preguntaHer2);
    await esperarResultado(page);
    await page
      .getByRole('button', { name: new RegExp(`${cita.sourceName}.*${cita.externalId}`) })
      .click();

    for (const rotulo of [textos.cita.endpoint, textos.cita.tamanoMuestra]) {
      const valor = page
        .locator('dt', { hasText: rotulo })
        .locator('xpath=following-sibling::dd[1]');
      await expect(valor).toHaveText(textos.cita.noDisponible);
      await expect(valor.locator('[data-origen]')).toHaveCount(0);
    }
  });
});

test.describe('Estados del panel (L1D-141)', () => {
  test('llega un solo POST y un solo AIAnalysisRecord cuando el doctor hace doble clic en Analizar evidencia [US-062 AC-1]', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const respuestas: string[] = [];
    const peticiones: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/evidence-analyses'))
        peticiones.push(r.url());
    });
    page.on('response', async (r) => {
      if (r.request().method() === 'POST' && r.url().endsWith('/api/evidence-analyses'))
        respuestas.push(((await r.json()) as { id: string }).id);
    });
    await iniciarSesion(page);
    await page.getByLabel('Pregunta clínica').fill(preguntaHer2);

    await page.getByRole('button', { name: 'Analizar evidencia' }).dblclick();

    await esperarResultado(page);
    expect(peticiones).toHaveLength(1);
    expect(new Set(respuestas).size).toBe(1);
    await expect(page.getByRole('button', { name: 'Analizar evidencia' })).toBeEnabled();
  });

  test('muestra el estado sin evidencia con su alcance y Relevancia máxima: no aplica para Q-SIN [US-062 AC-2]', async ({
    page,
  }) => {
    await analizar(page, preguntaSinEvidencia);
    await esperarResultado(page);

    await expect(page.getByText(textos.resultado.sinEvidencia)).toBeVisible();
    await expect(page.getByText(textos.resultado.sinEvidenciaAlcance)).toBeVisible();
    await expect(page.getByText('Relevancia máxima: no aplica')).toBeVisible();
    const busqueda = page.getByRole('region', { name: textos.resultado.queSeBusco });
    await expect(busqueda).toContainText(preguntaSinEvidencia);
    await expect(page.getByRole('heading', { level: 3, name: 'Base del análisis' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('redirige a /login?motivo=expirada sin datos del paciente cuando la sesión expiró [US-062 AC-3]', async ({
    page,
    context,
  }) => {
    await iniciarSesion(page);
    // Espera la lectura inicial del checklist: así la sesión vence después de ella y el 401 llega al pulsar el botón.
    await expect(page.getByRole('button', { name: 'Analizar evidencia' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /datos críticos/ })).toBeVisible();
    const cookies = await context.cookies();
    const origen = new URL(page.url()).origin;
    await page.request.post('/api/auth/logout', { headers: { Origin: origen } });
    await context.clearCookies();
    await context.addCookies(cookies);

    await page.getByLabel('Pregunta clínica').fill(preguntaHer2);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();

    await expect(page).toHaveURL(/\/login\?motivo=expirada$/);
    await expect(page.getByRole('status')).toHaveText('Tu sesión expiró. Vuelve a iniciar sesión.');
    await expect(page.getByText(/Paciente · ID/)).toHaveCount(0);
    await expect(page.getByText(ID_SEMILLA_A)).toHaveCount(0);
  });
});
