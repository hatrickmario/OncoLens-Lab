import { expect, test, type Page, type Request } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import { violacionesGraves } from './axe';
import { iniciarSesion } from './soporte';

const { conversacion } = es;
const PREGUNTAS = [
  '¿Cuál es la situación actual de esta paciente?',
  '¿Qué información importante falta?',
  '¿Qué evidencia existe para pacientes con las características de esta paciente?',
];

const esPostDeTurno = (r: Request) => r.method() === 'POST' && /\/api\/conversations\/[^/]+\/turns$/.test(r.url());

async function preguntar(page: Page, texto: string) {
  const respuesta = page.waitForResponse((r) => esPostDeTurno(r.request()));
  await page.getByLabel(conversacion.campo).fill(texto);
  await page.getByRole('button', { name: conversacion.preguntar }).click();
  await respuesta;
}

test.describe('Panel conversacional (L1D-324)', () => {
  test('muestra tres tarjetas en orden con chips de intención, enlaces ◆ y cita [E1] en la misma conversación [US-267 AC-1]', async ({
    page,
  }) => {
    const turnos: Request[] = [];
    page.on('request', (r) => esPostDeTurno(r) && turnos.push(r));
    await iniciarSesion(page);

    for (const pregunta of PREGUNTAS) await preguntar(page, pregunta);

    const tarjetas = page.getByRole('article');
    await expect(tarjetas).toHaveCount(3);
    await expect(tarjetas.nth(0)).toContainText(conversacion.intenciones.caso);
    await expect(tarjetas.nth(1)).toContainText(conversacion.intenciones.faltantes);
    await expect(tarjetas.nth(2)).toContainText(conversacion.intenciones.evidencia);
    await expect(tarjetas.nth(0).getByRole('link', { name: /Ver en el caso/ }).first()).toBeVisible();
    await expect(tarjetas.nth(1).getByRole('link', { name: /Ver en el caso/ }).first()).toBeVisible();
    await expect(tarjetas.nth(2)).toContainText('[E1]');
    expect(new Set(turnos.map((r) => new URL(r.url()).pathname)).size).toBe(1);
  });

  test('solo llama al origen de web y nunca pone la pregunta en la URL [US-267 AC-6]', async ({
    page,
  }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await iniciarSesion(page);

    for (const pregunta of PREGUNTAS) await preguntar(page, pregunta);

    const origen = new URL(page.url()).origin;
    expect(urls.every((u) => u.startsWith(origen) || u.startsWith('data:'))).toBe(true);
    const deConversacion = urls.filter((u) => /\/conversations/.test(u));
    expect(deConversacion.length).toBeGreaterThan(0);
    expect(
      deConversacion.every((u) => /^\/api\/(patients\/[^/]+\/conversations|conversations\/)/.test(new URL(u).pathname)),
    ).toBe(true);
    for (const pregunta of PREGUNTAS) {
      expect(urls.some((u) => decodeURIComponent(u).includes(pregunta.slice(0, 20)))).toBe(false);
    }
  });

  test('no tiene violaciones graves de axe con tres turnos y envía un cuarto solo con teclado [US-267 AC-7]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    for (const pregunta of PREGUNTAS) await preguntar(page, pregunta);

    expect(await violacionesGraves(page)).toEqual([]);

    const envio = page.waitForResponse((r) => esPostDeTurno(r.request()));
    await page.getByLabel(conversacion.campo).focus();
    await page.keyboard.type('¿Qué información importante falta?');
    await page.keyboard.press('Enter');
    await envio;
    await expect(page.getByRole('article')).toHaveCount(4);
  });
});
