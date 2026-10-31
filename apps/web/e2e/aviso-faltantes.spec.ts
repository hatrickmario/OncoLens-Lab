import { expect, test } from '@playwright/test';
import { ID_SEMILLA_A, iniciarSesion, ejemplo } from './soporte';

const pregunta = ejemplo('rag-query-request.json').query as string;

test.describe('Aviso de faltantes antes de analizar (L1D-97)', () => {
  test('avisa los faltantes del paciente semilla (a) y envía un solo POST con continueWithWarning true [US-005 AC-1] [US-005 AC-2]', async ({
    page,
  }) => {
    const cuerpos: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/evidence-analyses'))
        cuerpos.push(r.postData() ?? '');
    });
    await iniciarSesion(page);

    const aviso = page.getByRole('status').filter({ hasText: /datos críticos/ });
    await expect(aviso).toBeVisible();
    expect(cuerpos).toHaveLength(0);
    const boton = page.getByRole('button', { name: 'Analizar evidencia' });
    await expect(boton).toBeEnabled();
    await page.getByLabel('Pregunta clínica').fill(pregunta);
    await boton.click();

    await expect(page.getByTestId('analysis-result')).toBeVisible();
    expect(cuerpos).toHaveLength(1);
    expect(JSON.parse(cuerpos[0]!).continueWithWarning).toBe(true);
  });

  test('lleva el enlace de Ki-67 a la ficha con el foco en Biomarcadores sin enviar análisis [US-005 AC-3]', async ({
    page,
  }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/evidence-analyses')) posts++;
    });
    await iniciarSesion(page);

    await page.getByRole('link', { name: 'Registrar Ki-67 en la ficha' }).click();

    await expect(page).toHaveURL(new RegExp(`/pacientes/${ID_SEMILLA_A}#biomarcadores$`));
    await expect(page.locator('h2#biomarcadores')).toBeFocused();
    expect(posts).toBe(0);
  });
});
