import { expect, test, type Page, type Request } from '@playwright/test';
import type {
  ConversationTurn,
  EvidenceAnalysis,
} from '../../../packages/api-contracts/src/types/clinical-api';
import es from '../messages/es.json' with { type: 'json' };
import { violacionesGraves } from './axe';
import { iniciarSesion, tarjetasDelChat } from './soporte';

const { conversacion } = es;
/** Preguntas literales del chat falso de rag: caso, faltantes y la `query` del ejemplo de evidencia. */
const PREGUNTA_CASO = '¿Cuál es la situación actual de la paciente?';
const PREGUNTA_FALTANTES = '¿Qué información falta?';
const PREGUNTA_EVIDENCIA =
  '¿Qué opciones adyuvantes describe la evidencia para cáncer de mama HER2 positivo en estadio IIA?';
const BORRADOR = '¿Qué población estudió la fuente de la opción 1?';
/** `idSembrado('paciente-chat')` (P-CHAT, FX-12-b): el mismo UUID determinista del seed de clinical-api. */
const ID_PACIENTE_CHAT = '71ca1471-4002-541a-a9e1-06e6f7ff026d';
/**
 * `idSembrado('paciente-chat/her2-3mas')`: la fila HER2 `3+` que corrige al `2+` (ADR-50). El chat falso sirve
 * `chat-turn-caso-ok.json`, cuyo `f2` Backend 1 resuelve al segundo hecho del caso (RE, sin histórico), no al HER2.
 */
const ID_HER2_3MAS = '3d833f05-b6a1-574a-a646-8235c738a647';
const ESPERA = { timeout: 5_000 };

const esPostDeTurno = (r: Request) =>
  r.method() === 'POST' && /\/api\/conversations\/[^/]+\/turns$/.test(r.url());

/** Envía la pregunta y devuelve el turno que respondió el BFF. */
async function preguntar(page: Page, texto: string): Promise<ConversationTurn> {
  const respuesta = page.waitForResponse((r) => esPostDeTurno(r.request()));
  await page.getByLabel(conversacion.campo).fill(texto);
  await page.getByRole('button', { name: conversacion.preguntar }).click();
  return (await (await respuesta).json()) as ConversationTurn;
}

/** El contenedor con *scroll* del hilo: el padre del `role="log"`. */
const hilo = (page: Page) => page.getByRole('log', { name: conversacion.hilo }).locator('..');
const scrollDelHilo = (page: Page) => hilo(page).evaluate((el) => el.scrollTop);

/** Espera a que el desplazamiento y la altura del hilo no cambien entre dos lecturas separadas. */
async function esperarHiloAsentado(page: Page) {
  const medida = () => hilo(page).evaluate((el) => `${el.scrollTop}/${el.scrollHeight}`);
  let anterior = await medida();
  await expect
    .poll(async () => {
      const actual = await medida();
      const estable = actual === anterior;
      anterior = actual;
      return estable;
    }, ESPERA)
    .toBe(true);
}

test.describe('Fuentes y datos sin perder la conversación (L1D-325)', () => {
  test('abre el fragmento en un panel lateral y al cerrarlo con Esc conserva el scroll del hilo, el borrador y el foco [US-268 AC-1]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await preguntar(page, PREGUNTA_CASO);
    await preguntar(page, PREGUNTA_FALTANTES);
    const turno = await preguntar(page, PREGUNTA_EVIDENCIA);
    await expect(tarjetasDelChat(page)).toHaveCount(3);
    const cita = tarjetasDelChat(page)
      .nth(2)
      .getByRole('button', { name: /^\[E1 · frag\. \d+\]/ });
    await expect(cita).toBeVisible(ESPERA);
    await page.getByLabel(conversacion.campo).fill(BORRADOR);
    // La posición se mide con el hilo asentado y la cita a la vista (un clic desplazaría el hilo hasta ella).
    await cita.scrollIntoViewIfNeeded();
    await esperarHiloAsentado(page);
    const scrollAntes = await scrollDelHilo(page);
    expect(scrollAntes).toBeGreaterThan(0);
    const urlAntes = page.url();
    const citaDelTurno = turno.blocks.flatMap((b) => b.citations ?? [])[0]!;
    const fuente = (turno.evidenceAnalysis as EvidenceAnalysis).evidenceOptions
      .flatMap((o) => o.citedSources)
      .find((f) => f.chunkId === citaDelTurno.chunkId);

    await cita.click();

    const panel = page.getByRole('dialog', { name: es.conversacion.panel.tituloCita });
    await expect(panel).toBeVisible(ESPERA);
    await expect(panel).toContainText(citaDelTurno.chunkTextSnapshot);
    if (fuente) await expect(panel).toContainText(fuente.title);
    expect(page.url()).toBe(urlAntes);
    expect(await violacionesGraves(page)).toEqual([]);

    await page.keyboard.press('Escape');

    await expect(panel).toHaveCount(0, ESPERA);
    expect(await scrollDelHilo(page)).toBe(scrollAntes);
    await expect(page.getByLabel(conversacion.campo)).toHaveValue(BORRADOR);
    await expect(cita).toBeFocused();
    await expect(tarjetasDelChat(page)).toHaveCount(3);
  });

  test('abre el dato de HER2 con su origen y el 2+ reemplazado en el histórico sin cambiar la URL [US-268 AC-2]', async ({
    page,
  }) => {
    await iniciarSesion(page);
    await page.goto(`/pacientes/${ID_PACIENTE_CHAT}/analisis`);
    // Solo se apunta el `dataLink` de `f2` a la fila HER2 real del seed; el BFF, el histórico y el panel son los reales.
    await page.route('**/api/conversations/*/turns', async (route) => {
      const respuesta = await route.fetch();
      const turno = (await respuesta.json()) as ConversationTurn;
      for (const enlace of turno.dataLinks) {
        if (enlace.factRef === 'f2') enlace.resourceId = ID_HER2_3MAS;
      }
      await route.fulfill({ response: respuesta, json: turno });
    });
    await preguntar(page, PREGUNTA_CASO);
    await expect(tarjetasDelChat(page)).toHaveCount(1);
    const urlAntes = page.url();

    await tarjetasDelChat(page)
      .first()
      .getByRole('button', { name: /Biomarcador.*Ver en el caso/ })
      .click();

    const panel = page.getByRole('dialog', { name: es.conversacion.panel.tituloDato });
    await expect(panel).toBeVisible(ESPERA);
    await expect(panel).toContainText('HER2: 3+');
    await expect(panel).toContainText(es.conversacion.panel.origen);
    const historico = panel.getByRole('list', { name: es.ficha.correccion.historico.etiqueta });
    await expect(historico).toContainText('2+', ESPERA);
    await expect(historico).toContainText(es.ficha.correccion.historico.reemplazado);
    expect(page.url()).toBe(urlAntes);
    await expect(tarjetasDelChat(page)).toHaveCount(1);
  });
});
