// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  crearBffConversacionSimulado,
  turnoContextual,
  turnoDeCaso,
  turnoDeEvidencia,
  turnoFaltantes,
  turnoFueraDeAlcance,
  turnoInterpretacion,
} from '../support/msw/conversaciones';
import {
  buscarTarjetas,
  montarPanel,
  mostrarTurno,
  preguntar,
  respuestaDeTurno,
  tarjetas,
  textos,
  turnoCon,
} from '../support/conversacion-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
// Los avisos de RN-19 salen del ejemplo del contrato: `web` no los lleva como literal (US-069).
const AVISOS_RN19 = turnoDeCaso.notices;
const ENCABEZADO = 'Opciones descritas en la evidencia';

describe('Avisos de IA del turno', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('pinta en cada tarjeta los avisos recibidos y el encabezado solo en la de evidencia [US-267 AC-2]', async () => {
    bff.responderTurnos(
      respuestaDeTurno(turnoDeCaso),
      respuestaDeTurno(turnoCon(turnoFaltantes, { notices: AVISOS_RN19 }, 2)),
      respuestaDeTurno({ ...turnoDeEvidencia, turnNumber: 3 }),
    );
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, 'Primera');
    await buscarTarjetas();
    await preguntar(usuario, 'Segunda');
    await screen.findByText(/Faltantes/);
    await preguntar(usuario, 'Tercera');
    await screen.findByRole('heading', { name: ENCABEZADO });

    const lista = tarjetas();
    expect(lista).toHaveLength(3);
    for (const tarjeta of lista) {
      for (const aviso of AVISOS_RN19) {
        expect(within(tarjeta).getAllByText(aviso).length).toBeGreaterThan(0);
      }
    }
    expect(screen.getAllByText(ENCABEZADO)).toHaveLength(1);
    expect(within(lista[2]!).getByText(ENCABEZADO)).toBeTruthy();
  });

  it('muestra el texto de notices y ningún aviso de la configuración cuando el turno trae otro texto', async () => {
    const { tarjeta } = await mostrarTurno(bff, {
      ...turnoDeCaso,
      notices: ['Aviso sintético del backend'],
    });

    expect(within(tarjeta).getByText('Aviso sintético del backend')).toBeTruthy();
    expect(within(tarjeta).queryByText(/Generado por IA/)).toBeNull();
    expect(within(tarjeta).queryByText(/Uso académico/)).toBeNull();
  });

  it('pinta tal cual el supuesto de la búsqueda ampliada que llega en notices', async () => {
    const { tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoContextual, { evidenceAnalysis: turnoDeEvidencia.evidenceAnalysis }),
    );

    const supuesto = 'La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador';
    expect(within(tarjeta).getByText(supuesto)).toBeTruthy();
    for (const aviso of AVISOS_RN19) {
      expect(within(tarjeta).getAllByText(aviso).length).toBeGreaterThan(0);
    }
  });

  it('no pinta el contenido y avisa con role alert cuando hay bloques generados y notices vacío', async () => {
    const { tarjeta } = await mostrarTurno(bff, turnoCon(turnoInterpretacion, { notices: [] }));

    expect(within(tarjeta).getByRole('alert').textContent).toContain(textos.sinAvisosTitulo);
    expect(within(tarjeta).queryByText(turnoInterpretacion.blocks[0]!.text)).toBeNull();
    expect(within(tarjeta).queryByText(textos.rotulos.interpretacion)).toBeNull();
  });

  it('no pinta el bloque y avisa con role alert cuando el kind es desconocido y notices está vacío (RN-19 falla cerrado)', async () => {
    const { tarjeta } = await mostrarTurno(bff, {
      ...turnoDeCaso,
      notices: [],
      blocks: [{ kind: 'desconocido', text: 'Texto generado de un kind nuevo' }],
    });

    expect(within(tarjeta).getByRole('alert').textContent).toContain(textos.sinAvisosTitulo);
    expect(within(tarjeta).queryByText('Texto generado de un kind nuevo')).toBeNull();
  });

  it('no añade avisos de IA a un mensaje del sistema con notices vacío', async () => {
    const { tarjeta } = await mostrarTurno(bff, turnoCon(turnoFueraDeAlcance));

    expect(within(tarjeta).queryByText(/Generado por IA/)).toBeNull();
    expect(within(tarjeta).queryByRole('alert')).toBeNull();
    expect(within(tarjeta).getByText(turnoFueraDeAlcance.blocks[0]!.text)).toBeTruthy();
  });
});
