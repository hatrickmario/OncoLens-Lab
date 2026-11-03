// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaTresOpciones,
  crearBffAnalisisSimulado,
  seguimientoTurno,
} from '../support/msw/evidence-analyses';
import { analizarYAbrirHilo, followUp, preguntar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const PREGUNTA = '¿La evidencia describe diferencias según el estado menopáusico?';

function retener() {
  let liberar: () => void = () => {};
  const compuerta = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  return { compuerta, liberar };
}

describe('Hilo de seguimiento · espera', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra solo el progreso y la respuesta completa al liberarla cuando la petición está en curso [US-219 AC-3]', async () => {
    const { compuerta, liberar } = retener();
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno, compuerta });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const progreso = await screen.findByText(followUp.progresoBuscando);
    expect(progreso.closest('[role="status"]')).toBeTruthy();
    expect(screen.getByText(followUp.progresoValidando)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: followUp.preguntando }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByText(seguimientoTurno.answer[0]!.text)).toBeNull();
    expect(screen.queryByRole('article', { name: /Pregunta 1/ })).toBeNull();

    liberar();

    expect(await screen.findByText(seguimientoTurno.answer[0]!.text)).toBeTruthy();
    expect(screen.queryByText(followUp.progresoBuscando)).toBeNull();
  });

  it('registra una sola petición cuando se envía dos veces seguidas [US-219 AC-3]', async () => {
    const { compuerta, liberar } = retener();
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno, compuerta });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await usuario.type(screen.getByLabelText(followUp.campo), PREGUNTA);
    await usuario.dblClick(screen.getByRole('button', { name: followUp.preguntar }));

    liberar();
    await screen.findByRole('article', { name: /Pregunta 1/ });
    expect(bff.peticionesDeSeguimiento).toHaveLength(1);
  });
});
