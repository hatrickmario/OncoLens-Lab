// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import errorPermisoDenegado from '../../../../contracts/examples/error-permiso-denegado.json';
import {
  crearBffConversacionSimulado,
  errorOptOut,
  turnoDeCaso,
} from '../support/msw/conversaciones';
import {
  buscarTarjetas,
  cuantasTarjetas,
  montarPanel,
  preguntar,
  respuestaDeTurno,
  textos,
} from '../support/conversacion-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
const LIMITE = 2000;

async function pegar(texto: string) {
  const usuario = userEvent.setup();
  montarPanel();
  await usuario.click(screen.getByLabelText(textos.campo));
  await usuario.paste(texto);
  await usuario.click(screen.getByRole('button', { name: textos.preguntar }));
}

describe('Reglas del envío', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('envía la pregunta en NFC sin error cuando en NFD supera 2000 caracteres y en NFC no [US-250 AC-1] [US-250 AC-3]', async () => {
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso));
    const nfc = 'é'.repeat(1001);
    const nfd = nfc.normalize('NFD');
    expect(nfd.length).toBeGreaterThan(LIMITE);

    await pegar(nfd);

    await buscarTarjetas();
    expect(bff.turnos.map((t) => t.cuerpo)).toEqual([{ question: nfc }]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no envía y avisa cuando la pregunta supera 2000 caracteres ya en NFC [US-250 AC-3]', async () => {
    await pegar('a'.repeat(LIMITE + 1));

    expect((await screen.findByRole('alert')).textContent).toContain(textos.errorTitulo);
    expect(bff.turnos).toHaveLength(0);
    expect(cuantasTarjetas()).toBe(0);
  });

  it('ofrece Reintentar y no bloquea el panel cuando el 403 no es un opt-out [RN-15]', async () => {
    bff.responderTurnos({ status: 403, cuerpo: errorPermisoDenegado });
    const usuario = userEvent.setup();
    montarPanel();

    await preguntar(usuario, 'Una pregunta');

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByRole('button', { name: textos.reintentar })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('muestra un status neutro y bloquea el panel cuando el 403 trae el error de opt-out [RN-15]', async () => {
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso), { status: 403, cuerpo: errorOptOut });
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, 'Primera');
    await buscarTarjetas();

    await preguntar(usuario, 'Segunda');

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toBe(textos.optOut);
    await waitFor(() =>
      expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).disabled).toBe(true),
    );
    expect(document.body.textContent).not.toMatch(/403|OPT_OUT/);
  });
});
