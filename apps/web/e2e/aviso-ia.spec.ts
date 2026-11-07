import { expect, test } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };
import {
  analizar,
  ejemplo,
  esperarResultado,
  esperarTarjeta,
  iniciarSesion,
  preguntarEnElChat,
  tarjetasDelChat,
} from './soporte';

const pregunta = '¿Cuál es la situación actual de la paciente?';
const preguntaHer2 = ejemplo('rag-query-request.json').query as string;
const preguntaSinEvidencia = ejemplo('rag-query-request-sin-evidencia.json').query as string;
/** Avisos que devuelve el backend en `notices[]`: en modo falso, los de los ejemplos del contrato (la UI no los lleva en su configuración). */
const avisosDelTurno = ejemplo('chat-turn-caso-ok.json').notices as string[];
const avisosDeEvidencia = ejemplo('chat-turn-evidencia.json').notices as string[];
/** Aviso que solo trae un turno de caso sin datos: no debe colarse en un turno de evidencia. */
const avisoAjeno = (ejemplo('chat-turn-caso-sin-datos.json').notices as string[])[2]!;
const ETIQUETA = es.app.academicUseLabel;
const regionDeAvisos = (tarjeta: ReturnType<typeof tarjetasDelChat>) =>
  tarjeta.getByRole('region', { name: es.conversacion.avisosTitulo });

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

  test('muestra los dos avisos de IA en un turno de evidencia y ninguno ajeno [US-069 AC-1] [RN-19]', async ({
    page,
  }) => {
    await analizar(page, preguntaHer2);
    await esperarResultado(page);

    const avisos = regionDeAvisos(tarjetasDelChat(page).first());
    for (const aviso of avisosDeEvidencia) {
      await expect(avisos.getByText(aviso, { exact: true })).toBeVisible();
    }
    expect(avisosDeEvidencia).toHaveLength(2);
    await expect(avisos).not.toContainText(avisoAjeno);
    await expect(page.getByText(avisoAjeno)).toHaveCount(0);
  });

  test('muestra los avisos de IA y no bloquea cuando el análisis es sin_evidencia [US-069 AC-4] [RN-26]', async ({
    page,
  }) => {
    await analizar(page, preguntaSinEvidencia);
    await esperarResultado(page);

    await expect(page.getByText('Relevancia máxima: no aplica')).toBeVisible();
    const avisos = regionDeAvisos(tarjetasDelChat(page).first());
    await expect(avisos.getByRole('listitem').first()).toBeVisible();
    await preguntarEnElChat(page, pregunta);
    await esperarTarjeta(page, 2);
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
    // Se lee del DOM de la tarjeta, no del fixture: la etiqueta académica es de la cabecera, no de `notices[]`.
    const avisosPintados = await regionDeAvisos(tarjetasDelChat(page).first()).allInnerTexts();
    for (const texto of avisosPintados) expect(texto).not.toContain(ETIQUETA);

    await page.route('**/api/conversations/*/turns', (ruta) =>
      ruta.fulfill({ status: 502, json: ejemplo('error-servicio-ia.json') }),
    );
    await preguntarEnElChat(page, pregunta);
    await expect(page.getByRole('alert')).toContainText(es.conversacion.errorTitulo);
    await expect(cabecera.getByText(ETIQUETA)).toBeVisible();
  });
});
