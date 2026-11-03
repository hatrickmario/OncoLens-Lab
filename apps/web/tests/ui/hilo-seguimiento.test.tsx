// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaTresOpciones,
  crearBffAnalisisSimulado,
  seguimientoTurno,
  sinEvidencia,
} from '../support/msw/evidence-analyses';
import { analizar, analizarYAbrirHilo, followUp, preguntar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const AVISO_ACADEMICO = 'Uso académico/investigación';
const PREGUNTA = '¿La evidencia describe diferencias según el estado menopáusico?';

function sinTotal() {
  const { maxFollowUps: _omitido, ...base } = conEvidenciaTresOpciones.analysisBasis;
  return { ...conEvidenciaTresOpciones, analysisBasis: base };
}

describe('Hilo de seguimiento · contenido', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra encabezado, contexto fijo y 0 de 10 preguntas usadas bajo la Base cuando el análisis tiene evidencia [US-219 AC-1]', async () => {
    await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    const base = screen.getByRole('heading', { name: 'Base del análisis' });
    const hilo = screen.getByRole('heading', { name: followUp.titulo });
    expect(base.compareDocumentPosition(hilo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(followUp.contextoTitulo)).toBeTruthy();
    expect(screen.getByText(/Los hallazgos del análisis son contexto, no evidencia\./)).toBeTruthy();
    expect(screen.getByText('0 de 10 preguntas usadas')).toBeTruthy();
  });

  it('muestra el contador con el turnNumber devuelto por el servidor [US-219 AC-1]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: { ...seguimientoTurno, turnNumber: 2 } });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    expect(await screen.findByText('2 de 10 preguntas usadas')).toBeTruthy();
  });

  it('no muestra el hilo cuando el análisis es sin_evidencia [US-219 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: sinEvidencia });
    await analizar();

    expect(await screen.findByText('Relevancia máxima: no aplica')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: followUp.titulo })).toBeNull();
  });

  it('muestra 0 preguntas usadas sin total cuando la Base no trae maxFollowUps [US-219 AC-1]', async () => {
    await analizarYAbrirHilo(bff, sinTotal());

    expect(screen.getByText('0 preguntas usadas')).toBeTruthy();
    expect(screen.queryByText(/de 10 preguntas/)).toBeNull();
  });

  it('muestra la afirmación con dos citas, fuente nueva solo en chunk_90412 y «No disponible» en autoría [US-219 AC-2]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await screen.findByRole('article', { name: /Pregunta 1/ });
    expect(within(turno).getByText(seguimientoTurno.answer[0]!.text)).toBeTruthy();
    const chips = within(turno).getAllByRole('button', { name: /PMC9000001|CDR0000062787/ });
    expect(chips).toHaveLength(2);
    expect(within(turno).getAllByText(followUp.nuevaFuente)).toHaveLength(1);
    expect(chips[0]!.closest('li')!.textContent).toContain(followUp.nuevaFuente);
    expect(chips[1]!.closest('li')!.textContent).not.toContain(followUp.nuevaFuente);

    await usuario.click(chips[1]!);
    expect(within(turno).getByText('No disponible')).toBeTruthy();
    await usuario.click(within(turno).getByRole('button', { name: 'Ver fragmento' }));
    expect(screen.getByText(seguimientoTurno.citedSources[1]!.chunkTextSnapshot)).toBeTruthy();
  });

  it('muestra la nota de citas, el disclaimer del turno y la etiqueta académica [US-219 AC-2]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await screen.findByRole('article', { name: /Pregunta 1/ });
    expect(within(turno).getByText(followUp.notaCitas)).toBeTruthy();
    expect(within(turno).getByRole('note').textContent).toBe(seguimientoTurno.disclaimer);
    expect(within(turno).getByText(AVISO_ACADEMICO)).toBeTruthy();
  });

  it('muestra el disclaimer recibido y no el literal por defecto cuando el servidor envía otro texto [US-219 AC-2]', async () => {
    const aviso = 'Texto de aviso configurado en la prueba.';
    bff.responderSeguimiento({ status: 201, cuerpo: { ...seguimientoTurno, disclaimer: aviso } });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await screen.findByRole('article', { name: /Pregunta 1/ });
    expect(within(turno).getByRole('note').textContent).toBe(aviso);
    expect(within(turno).queryByText(seguimientoTurno.disclaimer)).toBeNull();
  });

  it('pinta el texto generado como texto y no crea elementos HTML cuando contiene etiquetas [US-219 AC-2]', async () => {
    const maligno = '<img src=x onerror=alert(1)>';
    const turnoMaligno = {
      ...seguimientoTurno,
      answer: [{ ...seguimientoTurno.answer[0]!, text: maligno }],
    };
    bff.responderSeguimiento({ status: 201, cuerpo: turnoMaligno });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await screen.findByRole('article', { name: /Pregunta 1/ });
    expect(within(turno).getByText(maligno)).toBeTruthy();
    expect(turno.querySelector('img')).toBeNull();
  });

  it('envía la pregunta en el cuerpo y no en la URL cuando se pregunta [US-219 AC-2]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);
    await screen.findByRole('article', { name: /Pregunta 1/ });

    const [peticion] = bff.peticionesDeSeguimiento;
    expect(peticion!.cuerpo).toEqual({ question: PREGUNTA });
    const url = new URL(peticion!.url);
    expect(url.pathname).toBe(`/api/evidence-analyses/${conEvidenciaTresOpciones.id}/follow-ups`);
    expect(url.search).toBe('');
  });
});
