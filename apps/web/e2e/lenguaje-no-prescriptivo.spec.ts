import { checkProhibitedTerms, loadProhibitedTerms } from '@oncolens/clinical-language';
import { expect, test, type Page } from '@playwright/test';
import origen from '../../../packages/clinical-language/origen-de-campos.json' with { type: 'json' };
import { analizar, ejemplo, textos } from './soporte';

const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSoloDescartadas = ejemplo('rag-query-request-solo-descartadas.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;
const citaDelEjemplo = ejemplo('rag-query-con-evidencia.json').evidenceOptions[0].citedSources[0];
const lista = loadProhibitedTerms();

interface TextosDeLaPagina {
  visibles: string[];
  etiquetas: string[];
  marcados: { campo: string; hijos: number; texto: string }[];
}

/** Texto visible fuera de las hojas del corpus, más todos los aria-label y los aria-describedby (design D5). */
async function extraerTextos(page: Page): Promise<TextosDeLaPagina> {
  return page.evaluate(() => {
    const visibles: string[] = [];
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
      const padre = nodo.parentElement;
      const texto = nodo.textContent?.trim();
      if (!padre || !texto || padre.closest('[data-origen="corpus"]')) continue;
      if (padre.closest('[hidden]') || padre.closest('script,style')) continue;
      visibles.push(texto);
    }
    const etiquetas = [...document.querySelectorAll('[aria-label]')].map(
      (n) => n.getAttribute('aria-label') ?? '',
    );
    for (const nodo of document.querySelectorAll('[aria-describedby]')) {
      for (const id of (nodo.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
        etiquetas.push(document.getElementById(id)?.textContent ?? '');
      }
    }
    const marcados = [...document.querySelectorAll('[data-origen]')].map((n) => ({
      campo: n.getAttribute('data-campo') ?? '',
      hijos: n.children.length,
      texto: n.textContent ?? '',
    }));
    return { visibles, etiquetas, marcados };
  });
}

async function verificarEstado(page: Page) {
  const { visibles, etiquetas, marcados } = await extraerTextos(page);
  const hallazgos = [...visibles, ...etiquetas].flatMap((texto) =>
    checkProhibitedTerms(texto, lista, { niveles: ['A'] }).map((c) => `${c.termino}: ${texto}`),
  );
  expect(hallazgos).toEqual([]);
  for (const marcado of marcados) {
    expect(origen.camposCopiadosDelCorpus).toContain(marcado.campo);
    expect(marcado.hijos).toBe(0);
    expect(marcado.texto).toBe(citaDelEjemplo[marcado.campo as keyof typeof citaDelEjemplo]);
  }
}

test.describe('Lenguaje no prescriptivo (L1D-193)', () => {
  test('muestra exactamente "Opciones descritas en la evidencia" y "Analizar evidencia" cuando el panel tiene una opción [US-068 AC-4]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);

    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      'Opciones descritas en la evidencia',
    );
    await expect(page.getByRole('button', { name: 'Analizar evidencia' })).toHaveText(
      'Analizar evidencia',
    );
  });

  test('no hay términos prohibidos en el texto visible ni en los aria-label ni aria-describedby de login y del panel en sus estados del S1 [US-068 AC-3]', async ({
    page,
  }) => {
    await page.goto('/login');
    await verificarEstado(page);
    await page.getByLabel('Correo electrónico').fill('desconocido@test.local');
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await verificarEstado(page);

    await analizar(page, preguntaHer2);
    await page.getByRole('button', { name: new RegExp(citaDelEjemplo.externalId) }).click();
    await page.getByRole('button', { name: textos.cita.verFragmento }).click();
    await verificarEstado(page);

    await page.getByLabel('Pregunta clínica').fill(preguntaSoloDescartadas);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();
    await page.getByRole('button', { name: textos.discarded.titulo }).click();
    await verificarEstado(page);

    await page.getByLabel('Pregunta clínica').fill(preguntaSinEvidencia);
    await page.getByRole('button', { name: 'Analizar evidencia' }).click();
    await expect(page.getByText('Relevancia máxima: no aplica')).toBeVisible();
    await verificarEstado(page);

    for (const [estado, ejemploDeError] of [
      [502, 'error-servicio-ia.json'],
      [503, 'error-llm-local-no-disponible.json'],
      [504, 'error-deadline-vencido.json'],
    ] as const) {
      await page.route('**/api/evidence-analyses', (ruta) =>
        ruta.fulfill({ status: estado, json: ejemplo(ejemploDeError) }),
      );
      await page.getByRole('button', { name: 'Analizar evidencia' }).click();
      await expect(page.getByText(/Código de traza:/)).toBeVisible();
      await verificarEstado(page);
      await page.unroute('**/api/evidence-analyses');
    }
  });
});
