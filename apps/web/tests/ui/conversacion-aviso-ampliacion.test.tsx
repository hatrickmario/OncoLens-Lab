// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  analisisSinOpciones,
  crearBffConversacionSimulado,
  turnoContextual,
  turnoDeEvidencia,
  turnoSinOpciones,
} from '../support/msw/conversaciones';
import { mostrarTurno, textos, turnoCon } from '../support/conversacion-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
// El `evidenceAnalysis` del ejemplo de Backend 2 es el interno; el del contrato público sale de su propio ejemplo.
const conOpciones = { evidenceAnalysis: turnoDeEvidencia.evidenceAnalysis };
const ENCABEZADO = 'Opciones descritas en la evidencia';
const AMPLIACION = 'La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador';
const SIN_OPCIONES = 'Evidencia recuperada sin opciones soportadas';
const sigue = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Avisos del turno de evidencia visibles', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('pinta el aviso de ampliación tras el encabezado y antes de la primera opción, sin expandir nada [US-274 AC-1]', async () => {
    const { tarjeta } = await mostrarTurno(bff, turnoCon(turnoContextual, conOpciones));

    const encabezado = within(tarjeta).getByRole('heading', { name: ENCABEZADO });
    const regionDeAvisos = within(tarjeta).getByRole('region', { name: textos.avisosTitulo });
    const aviso = within(regionDeAvisos).getByText(AMPLIACION);
    const primeraOpcion = within(tarjeta).getAllByRole('article')[0]!;
    expect(sigue(encabezado, aviso)).toBe(true);
    expect(sigue(aviso, primeraOpcion)).toBe(true);
    expect(aviso.closest('details')).toBeNull();
    expect(within(tarjeta).getByRole('button', { name: textos.expandirTodo }).ariaPressed).toBe(
      'false',
    );
    for (const recibido of turnoContextual.notices) {
      expect(within(regionDeAvisos).getAllByText(recibido)).toHaveLength(1);
    }
  });

  it('pinta el mensaje de sin opciones soportadas y el alcance sin plegar bajo «Alcance de la respuesta» [US-274 AC-2]', async () => {
    const { tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoSinOpciones, { evidenceAnalysis: analisisSinOpciones }),
    );

    const bloques = within(tarjeta)
      .getAllByText(textos.rotulos.alcance)
      .map((rotulo) => rotulo.closest('section')!);
    expect(bloques).toHaveLength(2);
    expect(within(bloques[0]!).getByText(SIN_OPCIONES, { exact: true })).toBeTruthy();
    expect(within(bloques[1]!).getByText(/^Alcance de la recuperación:/)).toBeTruthy();
    for (const bloque of bloques) expect(bloque.closest('details')).toBeNull();
    expect(within(tarjeta).queryByRole('heading', { name: ENCABEZADO })).toBeNull();
    expect(within(tarjeta).queryAllByRole('article')).toHaveLength(0);
  });

  it('pinta solo el texto de notices y ningún aviso de web en un turno de evidencia [US-274 AC-3]', async () => {
    const { tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoContextual, { ...conOpciones, notices: ['Aviso sintético del backend'] }),
    );

    const avisos = within(tarjeta).getByRole('region', { name: textos.avisosTitulo });
    expect(
      within(avisos)
        .getAllByRole('listitem')
        .map((e) => e.textContent),
    ).toEqual(['Aviso sintético del backend']);
    expect(within(tarjeta).queryByText(AMPLIACION)).toBeNull();
  });

  it('no pinta un turno de evidencia con bloques generados y notices vacío [US-274 AC-3]', async () => {
    const { tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoContextual, { ...conOpciones, notices: [] }),
    );

    expect(within(tarjeta).getByRole('alert').textContent).toContain(textos.sinAvisosTitulo);
    expect(within(tarjeta).queryByRole('heading', { name: ENCABEZADO })).toBeNull();
    expect(within(tarjeta).queryByText(SIN_OPCIONES)).toBeNull();
  });

  it('no pinta un turno con opciones en el análisis cuando blocks y notices vienen vacíos [US-274 AC-3]', async () => {
    const { tarjeta } = await mostrarTurno(
      bff,
      turnoCon(turnoContextual, { ...conOpciones, blocks: [], notices: [] }),
    );

    expect(within(tarjeta).getByRole('alert').textContent).toContain(textos.sinAvisosTitulo);
    expect(within(tarjeta).queryByRole('heading', { name: ENCABEZADO })).toBeNull();
    expect(within(tarjeta).queryAllByRole('article')).toHaveLength(0);
  });

  it('no pinta aviso de ampliación ni recuadro vacío cuando el turno no se amplió [US-274 AC-4]', async () => {
    const { tarjeta } = await mostrarTurno(bff, turnoCon(turnoDeEvidencia));

    expect(within(tarjeta).queryByText(/se amplió con datos del caso/)).toBeNull();
    const avisos = within(tarjeta).getByRole('region', { name: textos.avisosTitulo });
    const entradas = within(avisos).getAllByRole('listitem');
    expect(entradas.map((e) => e.textContent)).toEqual(turnoDeEvidencia.notices);
    expect(screen.queryAllByRole('region', { name: textos.avisosTitulo })).toHaveLength(1);
  });
});
