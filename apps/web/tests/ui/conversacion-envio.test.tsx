// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  crearBffConversacionSimulado,
  crearCompuerta,
  errorOptOut,
  errorTurno503,
  turnoDeCaso,
} from '../support/msw/conversaciones';
import {
  buscarTarjetas,
  cuantasTarjetas,
  montarPanel,
  preguntar,
  respuestaDeTurno,
  tarjetas,
  textos,
} from '../support/conversacion-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
const TEXTO_DEL_ASISTENTE = turnoDeCaso.blocks[0]!.text;

describe('Envío de una pregunta', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra Analizando… en un status, deshabilita Preguntar y no muestra texto del asistente hasta la respuesta completa [US-267 AC-4]', async () => {
    const retenida = crearCompuerta();
    bff.responderTurnos({ ...respuestaDeTurno(turnoDeCaso), compuerta: retenida.promesa });
    const usuario = userEvent.setup();
    montarPanel();

    await preguntar(usuario, '¿Cuál es la situación actual de la paciente?');

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain(textos.analizando);
    expect(
      (screen.getByRole('button', { name: textos.preguntar }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText(TEXTO_DEL_ASISTENTE, { exact: false })).toBeNull();
    expect(screen.getByText('¿Cuál es la situación actual de la paciente?')).toBeTruthy();

    retenida.abrir();
    expect(await screen.findByText(TEXTO_DEL_ASISTENTE, { exact: false })).toBeTruthy();
    expect(screen.queryByText(textos.analizando)).toBeNull();
  });

  it('envía una sola petición de turno cuando se pulsa Preguntar dos veces seguidas [US-267 AC-4]', async () => {
    const retenida = crearCompuerta();
    bff.responderTurnos({ ...respuestaDeTurno(turnoDeCaso), compuerta: retenida.promesa });
    const usuario = userEvent.setup();
    montarPanel();
    await usuario.type(screen.getByLabelText(textos.campo), 'Una pregunta');
    const boton = screen.getByRole('button', { name: textos.preguntar });

    await usuario.dblClick(boton);
    retenida.abrir();
    await buscarTarjetas();

    expect(bff.turnos).toHaveLength(1);
  });

  it('muestra el error con Reintentar y conserva la pregunta y el turno previo cuando el servicio responde 503 [US-267 AC-5]', async () => {
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso), { status: 503, cuerpo: errorTurno503 });
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, 'Primera pregunta');
    await buscarTarjetas();

    await preguntar(usuario, '¿Qué información importante falta?');

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(textos.errorTitulo);
    expect(within(alerta).getByRole('button', { name: textos.reintentar })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/503|sin_conexion_con_rag|LOCAL_LLM_UNAVAILABLE/);
    expect(screen.getByText('¿Qué información importante falta?')).toBeTruthy();
    expect(tarjetas()).toHaveLength(1);
    expect(within(alerta).queryByText(/Generado por IA|Uso académico/)).toBeNull();
  });

  it('reenvía la misma pregunta como petición nueva cuando se pulsa Reintentar [US-267 AC-5]', async () => {
    bff.responderTurnos({ status: 503, cuerpo: errorTurno503 }, respuestaDeTurno(turnoDeCaso));
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, '¿Qué información importante falta?');
    await usuario.click(await screen.findByRole('button', { name: textos.reintentar }));

    await buscarTarjetas();
    expect(bff.turnos.map((t) => t.cuerpo)).toEqual([
      { question: '¿Qué información importante falta?' },
      { question: '¿Qué información importante falta?' },
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ofrece Reintentar cuando falla la red sin añadir ningún turno [US-267 AC-5]', async () => {
    bff.responderTurnos({ status: 0, cuerpo: {}, red: true });
    const usuario = userEvent.setup();
    montarPanel();

    await preguntar(usuario, 'Una pregunta');

    expect((await screen.findByRole('alert')).textContent).toContain(textos.errorTitulo);
    expect(cuantasTarjetas()).toBe(0);
  });

  it('pone el hilo en un role log con aria-live polite y el campo con label visible [US-267 AC-7]', () => {
    montarPanel();

    const hilo = screen.getByRole('log');
    expect(hilo.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByLabelText(textos.campo).tagName).toBe('TEXTAREA');
    expect(document.querySelector('label')!.textContent).toBe(textos.campo);
  });

  it('deshabilita el campo y Preguntar y no envía nada cuando disabled es true [US-267 RN-15]', async () => {
    const usuario = userEvent.setup();
    montarPanel({ disabled: true });

    await usuario.type(screen.getByLabelText(textos.campo), 'Una pregunta');
    await usuario.click(screen.getByRole('button', { name: textos.preguntar }));

    expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: textos.preguntar }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(bff.aperturas).toHaveLength(0);
    expect(bff.turnos).toHaveLength(0);
  });

  it('deshabilita el panel sin añadir turno ni mostrar el 403 cuando el turno responde opt-out [US-267 RN-15]', async () => {
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso), { status: 403, cuerpo: errorOptOut });
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, 'Primera');
    await buscarTarjetas();

    await preguntar(usuario, 'Segunda');

    await waitFor(() =>
      expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).disabled).toBe(true),
    );
    expect(
      (screen.getByRole('button', { name: textos.preguntar }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(tarjetas()).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/403|OPT_OUT/);
  });
});
