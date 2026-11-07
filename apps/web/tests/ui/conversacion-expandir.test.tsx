// @vitest-environment jsdom
import { cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  crearBffConversacionSimulado,
  turnoDeCaso,
  turnoDeEvidencia,
  turnoFaltantes,
} from '../support/msw/conversaciones';
import {
  buscarTarjetas,
  montarPanel,
  mostrarTurno,
  preguntar,
  respuestaDeTurno,
  tarjetas,
  turnoCon,
} from '../support/conversacion-ui';
import { turnoDeEvidenciaConFuentes } from '../support/turno-con-fuentes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
const AVISO_OMITIDAS = /afirmaciones omitidas por falta de soporte/;

describe('Expandir y plegar un turno', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra la tabla de aplicabilidad y las afirmaciones omitidas al expandir, y los otros turnos no cambian [US-268 AC-3]', async () => {
    bff.responderTurnos(
      respuestaDeTurno(turnoDeCaso),
      respuestaDeTurno({
        ...turnoCon(turnoDeEvidenciaConFuentes({ omitidas: 2 }), {}, 2),
      }),
      respuestaDeTurno(turnoCon(turnoFaltantes, {}, 3)),
    );
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, '¿Cuál es la situación actual de esta paciente?');
    await preguntar(usuario, '¿Qué evidencia existe para pacientes como esta paciente?');
    await preguntar(usuario, '¿Qué información importante falta?');
    await vi.waitFor(() => expect(tarjetas()).toHaveLength(3));
    const [primero, segundo, tercero] = tarjetas() as [HTMLElement, HTMLElement, HTMLElement];
    const antesDelPrimero = primero.innerHTML;
    const antesDelTercero = tercero.innerHTML;

    const expandir = within(segundo).getByRole('button', { name: 'Expandir todo' });
    expect(expandir.getAttribute('aria-pressed')).toBe('false');
    expect(within(segundo).queryByText(AVISO_OMITIDAS)).toBeNull();
    await usuario.click(expandir);

    const plegar = within(segundo).getByRole('button', { name: 'Plegar todo' });
    expect(plegar.getAttribute('aria-pressed')).toBe('true');
    expect(within(segundo).getByText('2 afirmaciones omitidas por falta de soporte')).toBeTruthy();
    expect(
      within(segundo)
        .getByRole('button', { name: 'Ver aplicabilidad por criterio' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(within(segundo).getAllByText(/Coincide|Desconocido/).length).toBeGreaterThan(0);
    expect(primero.innerHTML).toBe(antesDelPrimero);
    expect(tercero.innerHTML).toBe(antesDelTercero);

    await usuario.click(plegar);
    const expandirDeNuevo = within(segundo).getByRole('button', { name: 'Expandir todo' });
    expect(expandirDeNuevo.getAttribute('aria-pressed')).toBe('false');
    expect(within(segundo).queryByText(AVISO_OMITIDAS)).toBeNull();
    expect(primero.innerHTML).toBe(antesDelPrimero);
    expect(tercero.innerHTML).toBe(antesDelTercero);
  });

  it('no muestra aviso de afirmaciones omitidas cuando omittedClaims es 0', async () => {
    const { usuario, tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoDeEvidenciaConFuentes({ omitidas: 0 })),
    );

    await usuario.click(within(tarjeta).getByRole('button', { name: 'Expandir todo' }));

    expect(within(tarjeta).queryByText(AVISO_OMITIDAS)).toBeNull();
  });

  it('usa el singular cuando omittedClaims es 1', async () => {
    const { usuario, tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoDeEvidenciaConFuentes({ omitidas: 1 })),
    );

    await usuario.click(within(tarjeta).getByRole('button', { name: 'Expandir todo' }));

    expect(within(tarjeta).getByText('1 afirmación omitida por falta de soporte')).toBeTruthy();
  });

  it('conserva el aviso de IA del turno al expandir y plegar', async () => {
    const { usuario, tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoDeEvidenciaConFuentes({ omitidas: 2 })),
    );
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Expandir todo' }));
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Plegar todo' }));

    const [aviso] = turnoDeEvidencia.notices;
    expect((await buscarTarjetas())[0]!.textContent).toContain(aviso);
  });
});
