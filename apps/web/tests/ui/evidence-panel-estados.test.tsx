// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidencia,
  conEvidenciaSoloDescartadas,
  crearBffAnalisisSimulado,
  errorDeadline,
  errorLlmNoDisponible,
  errorServicioIa,
  errorTipoCancer,
  sinEvidencia,
} from '../support/msw/evidence-analyses';
import { analizar, evidence, PREGUNTA_DE_PRUEBA } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

function textoDeError(error: { traceId: string }) {
  return `Código de traza: ${error.traceId}`;
}

function esperarSinResultadoParcial() {
  expect(screen.queryByRole('note')).toBeNull();
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  expect(screen.queryByTestId('relevance-label')).toBeNull();
  expect(screen.queryByText(evidence.discarded.titulo)).toBeNull();
}

describe('EvidencePanel · estados mínimos del S1', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra Relevancia máxima: no aplica y nunca 0 cuando el análisis es sin_evidencia [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02]', async () => {
    bff.responder({ status: 200, cuerpo: sinEvidencia });
    await analizar();

    expect(await screen.findByText(evidence.resultado.sinEvidencia)).toBeTruthy();
    expect(screen.getByText('Relevancia máxima: no aplica')).toBeTruthy();
    expect(screen.queryByText(/\b0,00\b|Relevancia máxima: 0/)).toBeNull();
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(sinEvidencia.disclaimer);
    }
  });

  it('muestra el código de traza sin detalles internos, sin aviso ni resultado parcial cuando la petición falla con 502 [pantallas-s1 S1-08/09] [RN-06]', async () => {
    bff.responder({ status: 502, cuerpo: errorServicioIa });
    await analizar();

    expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
    expect(screen.getByText(textoDeError(errorServicioIa))).toBeTruthy();
    expect(screen.queryByText(errorServicioIa.message)).toBeNull();
    expect(screen.queryByText(errorServicioIa.error)).toBeNull();
    esperarSinResultadoParcial();
  });

  it('muestra El modelo local no está disponible y el código de traza, sin el message ni el error de la respuesta, cuando la petición responde 503 [pantallas-s1 S1-08/09] [RN-06]', async () => {
    bff.responder({ status: 503, cuerpo: errorLlmNoDisponible });
    await analizar();

    expect(await screen.findByText(evidence.error.modeloNoDisponible)).toBeTruthy();
    expect(screen.getByText(textoDeError(errorLlmNoDisponible))).toBeTruthy();
    expect(screen.queryByText(errorLlmNoDisponible.message)).toBeNull();
    expect(screen.queryByText(errorLlmNoDisponible.error)).toBeNull();
    esperarSinResultadoParcial();
  });

  it('muestra el texto de tiempo agotado y el código de traza, sin detalles internos, cuando la petición responde 504 [pantallas-s1 S1-08/09] [RN-06]', async () => {
    bff.responder({ status: 504, cuerpo: errorDeadline });
    await analizar();

    expect(await screen.findByText(evidence.error.tiempoAgotado)).toBeTruthy();
    expect(screen.getByText(textoDeError(errorDeadline))).toBeTruthy();
    expect(screen.queryByText(errorDeadline.message)).toBeNull();
    expect(screen.queryByText(errorDeadline.error)).toBeNull();
    esperarSinResultadoParcial();
  });

  it('muestra el aviso y la frase sin opciones con soporte cuando solo hay descartadas [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02] [RN-06]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaSoloDescartadas });
    await analizar();

    expect(await screen.findByText(evidence.resultado.soloDescartadas)).toBeTruthy();
    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(conEvidenciaSoloDescartadas.disclaimer);
    }
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('redirige a /login cuando la petición responde 401', async () => {
    bff.responder({
      status: 401,
      cuerpo: { error: 'NO_AUTENTICADO', message: 'x', traceId: 'req_1' },
    });
    await analizar();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    esperarSinResultadoParcial();
  });

  it('conserva la pregunta y envía una petición nueva con el mismo cuerpo, sin cambiar de URL ni cerrar la sesión, cuando el oncólogo presiona Reintentar tras un 503 [pantallas-s1 S1-08/09] [RN-06] [S1 resp. 31]', async () => {
    bff.responder(
      { status: 503, cuerpo: errorLlmNoDisponible },
      { status: 200, cuerpo: conEvidencia },
    );
    const urlAntes = window.location.href;
    const usuario = await analizar();

    const reintentar = await screen.findByRole('button', { name: evidence.error.reintentar });
    expect((screen.getByLabelText(evidence.formulario.pregunta) as HTMLTextAreaElement).value).toBe(
      PREGUNTA_DE_PRUEBA,
    );
    esperarSinResultadoParcial();

    await usuario.click(reintentar);

    expect(
      await screen.findByRole('heading', { level: 2, name: evidence.resultado.encabezado }),
    ).toBeTruthy();
    expect(bff.cuerpos).toHaveLength(2);
    expect(bff.cuerpos[1]).toEqual(bff.cuerpos[0]);
    expect(screen.queryByText(evidence.error.modeloNoDisponible)).toBeNull();
    expect(window.location.href).toBe(urlAntes);
    expect(replace).not.toHaveBeenCalled();
  });

  it("muestra 'Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.' sin aviso de IA, sin sin_evidencia y con la pregunta conservada cuando la petición responde 422 TIPO_CANCER_NO_REGISTRADO [S1 resp. 35]", async () => {
    bff.responder({ status: 422, cuerpo: errorTipoCancer });
    await analizar();

    expect(await screen.findByText(evidence.noRealizado.sinTipoCancer)).toBeTruthy();
    esperarSinResultadoParcial();
    expect(screen.queryByText(/Relevancia máxima/)).toBeNull();
    expect(screen.queryByText(evidence.resultado.sinEvidencia)).toBeNull();
    expect(screen.queryByText(errorTipoCancer.error)).toBeNull();
    expect(screen.queryByText(textoDeError(errorTipoCancer))).toBeNull();
    expect(screen.queryByRole('button', { name: evidence.error.reintentar })).toBeNull();
    expect((screen.getByLabelText(evidence.formulario.pregunta) as HTMLTextAreaElement).value).toBe(
      PREGUNTA_DE_PRUEBA,
    );
  });
});
