import { expect, test } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import { iniciarSesion, preguntarEnElChat, tarjetasDelChat } from './soporte';

const { conversacion } = es;

/** `query` de `rag-query-request-contextual.json`: el chat falso sirve su ejemplo, con el aviso de la búsqueda ampliada. */
const PREGUNTA_AMPLIADA = '¿Qué evidencia hay para este caso?';
/** `query` de `rag-query-request-sin-opciones.json`: el chat falso sirve evidencia recuperada sin opciones. */
const PREGUNTA_SIN_OPCIONES = 'Q-TOX';
const AMPLIACION = 'La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador';
const SIN_OPCIONES = 'Evidencia recuperada sin opciones soportadas';

const ANCHOS = [
  { nombre: '375 px', ancho: 375, alto: 800 },
  { nombre: '1280 px', ancho: 1280, alto: 900 },
];

for (const { nombre, ancho, alto } of ANCHOS) {
  test.describe(`Avisos visibles del turno de evidencia a ${nombre} (L1D-332)`, () => {
    test.use({ viewport: { width: ancho, height: alto } });

    test(`muestra el aviso de ampliación tras el encabezado y antes de las opciones sin interacción [US-274 AC-5]`, async ({
      page,
    }) => {
      await iniciarSesion(page);
      await preguntarEnElChat(page, PREGUNTA_AMPLIADA);

      const tarjeta = tarjetasDelChat(page).first();
      const encabezado = tarjeta.getByRole('heading', {
        name: 'Opciones descritas en la evidencia',
      });
      const aviso = tarjeta.getByText(AMPLIACION);
      await expect(aviso).toBeVisible();
      await expect(encabezado).toBeVisible();
      const [yEncabezado, yAviso, yOpcion] = await Promise.all([
        encabezado.boundingBox(),
        aviso.boundingBox(),
        tarjeta.getByRole('article').first().boundingBox(),
      ]);
      expect(yAviso!.y).toBeGreaterThan(yEncabezado!.y);
      expect(yOpcion!.y).toBeGreaterThan(yAviso!.y);
      await expect(
        tarjeta.getByRole('button', { name: conversacion.expandirTodo }),
      ).toHaveAttribute('aria-pressed', 'false');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    });

    test(`muestra «${SIN_OPCIONES}» y su alcance sin interacción [US-274 AC-5]`, async ({
      page,
    }) => {
      await iniciarSesion(page);
      await preguntarEnElChat(page, PREGUNTA_SIN_OPCIONES);

      const tarjeta = tarjetasDelChat(page).first();
      await expect(tarjeta.getByText(SIN_OPCIONES, { exact: true })).toBeVisible();
      await expect(tarjeta.getByText(/^Alcance de la recuperación:/)).toBeVisible();
      await expect(tarjeta.getByText(conversacion.rotulos.alcance).first()).toBeVisible();
      await expect(
        tarjeta.getByRole('heading', { name: 'Opciones descritas en la evidencia' }),
      ).toHaveCount(0);
    });
  });
}
