// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esUrlHttpSegura } from '../../lib/evidence/procedencia';
import {
  crearBffConversacionSimulado,
  turnoDeCaso,
  turnoDeEvidencia,
  turnoFaltantes,
  turnoSinDatos,
} from '../support/msw/conversaciones';
import {
  buscarTarjetas,
  cuantasTarjetas,
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
const CLINICO = '◆ Información clínica del paciente';
const CORPUS = '▤ Evidencia científica (corpus)';

/** El bloque (`<section>`) que contiene el texto dado. */
function bloque(texto: string): HTMLElement {
  return screen.getByText(texto, { exact: false }).closest('section')!;
}

describe('Bloques del turno', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra tres tarjetas en orden con chip de intención, enlaces a datos y cita [E1] cuando se hacen tres preguntas [US-267 AC-1]', async () => {
    // El faltante enlaza al dato del caso que lo origina (`f1` del ejemplo `conversation-turn.json`).
    const conEnlace = {
      dataLinks: turnoDeCaso.dataLinks.slice(0, 1),
      blocks: turnoFaltantes.blocks.map((b) => ({ ...b, factRefs: ['f1'] })),
    };
    bff.responderTurnos(
      respuestaDeTurno(turnoDeCaso),
      respuestaDeTurno(turnoCon(turnoFaltantes, conEnlace, 2)),
      respuestaDeTurno({ ...turnoDeEvidencia, turnNumber: 3 }),
    );
    const usuario = userEvent.setup();
    montarPanel();
    await preguntar(usuario, '¿Cuál es la situación actual de esta paciente?');
    await screen.findByText('◆ Caso');
    await preguntar(usuario, '¿Qué información importante falta?');
    await screen.findByText('◌ Faltantes');
    await preguntar(usuario, '¿Qué evidencia existe para pacientes como esta paciente?');
    await screen.findByText('▤ Evidencia');

    const lista = tarjetas();
    expect(lista.map((t) => within(t).getByText(/^Turno \d$/).textContent)).toEqual([
      'Turno 1',
      'Turno 2',
      'Turno 3',
    ]);
    expect(within(lista[0]!).getAllByRole('link', { name: /Ver en el caso/ }).length).toBeGreaterThan(0);
    expect(within(lista[1]!).getAllByRole('link', { name: /Ver en el caso/ }).length).toBeGreaterThan(0);
    expect(within(lista[2]!).getAllByText(/\[E1\]/).length).toBeGreaterThan(0);
    const conversaciones = new Set(bff.turnos.map((t) => new URL(t.url).pathname));
    expect(conversaciones.size).toBe(1);
    expect(bff.aperturas).toHaveLength(1);
  });

  it('distingue por símbolo y rótulo la información clínica de la evidencia científica [US-267 AC-1]', async () => {
    const { tarjeta } = await mostrarTurno(bff, {
      ...turnoDeCaso,
      blocks: [turnoDeCaso.blocks[0]!, ...turnoDeEvidencia.blocks.slice(0, 1)],
    });

    const rotulos = [...tarjeta.querySelectorAll('section[data-grupo] > p:first-child')].map(
      (e) => e.textContent,
    );
    expect(rotulos).toEqual([CLINICO, CORPUS]);
  });

  it('rotula la interpretación aparte de la información clínica aunque lleve factRefs [US-267 AC-1]', async () => {
    await mostrarTurno(bff, {
      ...turnoDeCaso,
      blocks: [
        turnoDeCaso.blocks[0]!,
        { kind: 'interpretacion', text: 'Lectura sintética del caso.', factRefs: ['f1'] },
      ],
    });

    const interpretacion = bloque('Lectura sintética del caso.');
    expect(within(interpretacion).getByText(textos.rotulos.interpretacion)).toBeTruthy();
    expect(within(interpretacion).queryByText(CLINICO)).toBeNull();
    expect(interpretacion.closest('[data-grupo="clinico"]')).toBeNull();
  });

  it('rotula una limitación de un turno de caso como alcance, sin ◆ ni ▤ [US-267 AC-1]', async () => {
    const { tarjeta } = await mostrarTurno(bff, turnoCon(turnoSinDatos));

    expect(within(tarjeta).getByText(textos.rotulos.alcance)).toBeTruthy();
    expect(within(tarjeta).queryByText(CLINICO)).toBeNull();
    expect(within(tarjeta).queryByText(CORPUS)).toBeNull();
  });

  it('pinta con rótulo genérico y texto visible un bloque de kind desconocido [US-267 AC-1]', async () => {
    const { tarjeta } = await mostrarTurno(bff, {
      ...turnoDeCaso,
      campoNuevo: 'se ignora',
      blocks: [{ kind: 'kind_nuevo', text: 'Dato adicional validado' }],
    });

    expect(within(tarjeta).getByText(textos.rotulos.adicional)).toBeTruthy();
    expect(within(tarjeta).getByText('Dato adicional validado')).toBeTruthy();
    expect(within(tarjeta).queryByText(CLINICO)).toBeNull();
  });

  it('no crea img ni script ni href inseguro con Markdown hostil [US-267 AC-6]', async () => {
    const hostil = 'Texto <img src=x onerror="window.__xss=1"> y [enlace](javascript:alert(1))';
    const { tarjeta } = await mostrarTurno(bff, {
      ...turnoDeCaso,
      blocks: [{ kind: 'documentado', text: hostil }],
    });

    expect(tarjeta.querySelector('img')).toBeNull();
    expect(tarjeta.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    for (const enlace of tarjeta.querySelectorAll('a[href]')) {
      expect(esUrlHttpSegura(enlace.getAttribute('href'))).toBe(true);
    }
    expect(within(tarjeta).getByText(/enlace/)).toBeTruthy();
  });

  it('no monta el hilo de seguimiento ni su contador ni llama a follow-ups con un análisis con evidencia [US-267 AC-3]', async () => {
    const analisis = turnoDeEvidencia.evidenceAnalysis;
    const conLimite = {
      ...analisis,
      analysisBasis: { ...analisis.analysisBasis, maxFollowUps: 10 },
    };
    await mostrarTurno(bff, { ...turnoDeEvidencia, evidenceAnalysis: conLimite });

    expect(screen.queryByText('Preguntas de seguimiento sobre este análisis')).toBeNull();
    expect(screen.queryByText(/de 10 preguntas usadas/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Opciones descritas en la evidencia' })).toBeTruthy();
    expect(bff.seguimientos).toEqual([]);
  });
});
