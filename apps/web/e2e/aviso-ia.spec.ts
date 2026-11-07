import { expect, test } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import {
  analizar,
  ejemplo,
  esperarTarjeta,
  iniciarSesion,
  preguntarEnElChat,
  tarjetasDelChat,
} from './soporte';

const pregunta = '¿Cuál es la situación actual de esta paciente?';
/** Avisos que devuelve el backend en `notices[]`: en modo falso, los del ejemplo del contrato (la UI no los lleva en su configuración). */
const avisosDelTurno = ejemplo('chat-turn-caso-ok.json').notices as string[];
const ETIQUETA = es.app.academicUseLabel;

test.describe('Aviso de IA y etiqueta académica (L1D-194, US-267)', () => {
  test('muestra en la tarjeta del turno cada aviso de notices tal como llega [US-069 AC-1]', async ({
    page,
  }) => {
    await analizar(page, pregunta);
    await esperarTarjeta(page);

    const tarjeta = tarjetasDelChat(page).first();
    expect(avisosDelTurno.length).toBeGreaterThan(0);
    for (const aviso of avisosDelTurno) {
      await expect(tarjeta.getByText(aviso, { exact: true })).toBeVisible();
    }
  });

  test(`muestra ${ETIQUETA} en la cabecera de la página y no la añade a los avisos del turno [US-069 AC-3]`, async ({
    page,
  }) => {
    await iniciarSesion(page);
    const cabecera = page.getByRole('banner');
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();

    await preguntarEnElChat(page, pregunta);
    await esperarTarjeta(page);
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();

    await page.route('**/api/conversations/*/turns', (ruta) =>
      ruta.fulfill({ status: 502, json: ejemplo('error-servicio-ia.json') }),
    );
    await preguntarEnElChat(page, pregunta);
    await expect(page.getByRole('alert')).toContainText(es.conversacion.errorTitulo);
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();
    for (const aviso of avisosDelTurno) expect(aviso).not.toContain(ETIQUETA);
  });
});
