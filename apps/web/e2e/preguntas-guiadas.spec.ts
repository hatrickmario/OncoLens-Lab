import { expect, test, type Request } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import { violacionesGraves } from './axe';
import { iniciarSesion } from './soporte';

const { conversacion } = es;
const esPostDeTurno = (r: Request) => r.method() === 'POST' && /\/api\/conversations\/[^/]+\/turns$/.test(r.url());

test.describe('Preguntas guiadas (L1D-324)', () => {
  test('envía la guiada y la misma escrita a mano con el mismo cuerpo y tarjetas idénticas, sin marca de origen [US-267 AC-11]', async ({
    page,
  }) => {
    const cuerpos: string[] = [];
    page.on('request', (r) => esPostDeTurno(r) && cuerpos.push(r.postData() ?? ''));
    await iniciarSesion(page);
    const guiada = page.getByRole('group', { name: conversacion.guiadasTitulo }).getByRole('button').first();
    const texto = (await guiada.textContent())!;

    await guiada.click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByLabel(conversacion.campo).fill(texto);
    await page.getByRole('button', { name: conversacion.preguntar }).click();
    await expect(page.getByRole('article')).toHaveCount(2);

    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[0]).toBe(cuerpos[1]);
    expect(Object.keys(JSON.parse(cuerpos[0]!) as object)).toEqual(['question']);
    // La cabecera lleva número y hora del turno; lo comparable son los bloques y los avisos.
    const bloques = (n: number) => page.getByRole('article').nth(n).locator('section').allTextContents();
    expect(await bloques(0)).toEqual(await bloques(1));
    await expect(page.getByRole('article').first()).not.toContainText(/guiada/i);
  });

  test('no tiene violaciones graves de axe con las guiadas visibles y las envía con Tab y Enter [US-267 AC-8]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    const grupo = page.getByRole('group', { name: conversacion.guiadasTitulo });
    await expect(grupo).toBeVisible();

    expect(await violacionesGraves(page)).toEqual([]);

    await grupo.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('article')).toHaveCount(1);
  });
});
