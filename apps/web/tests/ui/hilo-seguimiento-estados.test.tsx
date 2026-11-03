// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaTresOpciones,
  crearBffAnalisisSimulado,
  errorLimiteSeguimiento,
  errorServicioIa,
  seguimientoFueraDeContexto,
  seguimientoSinEvidencia,
  seguimientoTurno,
} from '../support/msw/evidence-analyses';
import { analizarYAbrirHilo, evidence, followUp, preguntar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const PREGUNTA = '¿Existen ensayos que evalúen esta opción en pacientes con función renal reducida?';
const IMPERATIVOS = /\b(abre|reformula|escribe|consulta tú|debe|recomend)/i;

function turnoDeEstado(estado: typeof seguimientoSinEvidencia) {
  return screen.findByRole('article', { name: new RegExp(`Pregunta ${estado.turnNumber}`) });
}

describe('Hilo de seguimiento · estados', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra el límite de maxFollowUps, deshabilita el campo y oculta código y traza cuando responde 409 [US-219 AC-4]', async () => {
    bff.responderSeguimiento({ status: 409, cuerpo: errorLimiteSeguimiento });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    expect(await screen.findByText(followUp.limiteConTotal.replace('{max}', '10'))).toBeTruthy();
    expect(screen.getByRole('button', { name: followUp.nuevoAnalisis })).toBeTruthy();
    expect(screen.getByLabelText(followUp.campo).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: followUp.preguntar }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('10 de 10 preguntas usadas')).toBeTruthy();
    const hilo = screen.getByRole('region', { name: followUp.titulo });
    expect(hilo.textContent).not.toMatch(/409|LIMITE_SEGUIMIENTO/);
    expect(hilo.textContent).not.toContain(errorLimiteSeguimiento.traceId);
  });

  it('muestra su texto, «Nuevo análisis», el aviso y ninguna cita cuando el turno es sin_evidencia [US-219 AC-4]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoSinEvidencia });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await turnoDeEstado(seguimientoSinEvidencia);
    expect(within(turno).getByText(followUp.sinEvidencia)).toBeTruthy();
    expect(within(turno).getByRole('button', { name: followUp.nuevoAnalisis })).toBeTruthy();
    expect(within(turno).getByRole('note').textContent).toBe(seguimientoSinEvidencia.disclaimer);
    expect(within(turno).getByText('Uso académico/investigación')).toBeTruthy();
    expect(within(turno).queryByText(followUp.notaCitas)).toBeNull();
    expect(followUp.sinEvidencia).not.toMatch(IMPERATIVOS);
  });

  it('muestra su texto, «Nuevo análisis» y el aviso sin citas cuando el turno es fuera_de_contexto [US-219 AC-4]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoFueraDeContexto });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    const turno = await turnoDeEstado(seguimientoFueraDeContexto);
    expect(within(turno).getByText(followUp.fueraDeContexto)).toBeTruthy();
    expect(within(turno).getByRole('button', { name: followUp.nuevoAnalisis })).toBeTruthy();
    expect(within(turno).getByRole('note').textContent).toBe(
      seguimientoFueraDeContexto.disclaimer,
    );
    expect(within(turno).queryByRole('button', { name: /PMC|CDR/ })).toBeNull();
    expect(followUp.fueraDeContexto).not.toMatch(IMPERATIVOS);
  });

  it('lleva el foco al campo de pregunta del panel y conserva el análisis cuando se activa «Nuevo análisis» [US-219 AC-4]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoFueraDeContexto });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);
    await preguntar(usuario, PREGUNTA);
    const turno = await turnoDeEstado(seguimientoFueraDeContexto);

    await usuario.click(within(turno).getByRole('button', { name: followUp.nuevoAnalisis }));

    expect(document.activeElement).toBe(screen.getByLabelText(evidence.formulario.pregunta));
    expect(screen.getByTestId('analysis-result')).toBeTruthy();
  });

  it('muestra el mensaje genérico con su traza y no añade turno cuando responde 502 [US-219 AC-4]', async () => {
    bff.responderSeguimiento({ status: 502, cuerpo: errorServicioIa });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
    expect(screen.getByText(`Código de traza: ${errorServicioIa.traceId}`)).toBeTruthy();
    expect(screen.queryByRole('article', { name: /Pregunta/ })).toBeNull();
    expect(screen.getByText('0 de 10 preguntas usadas')).toBeTruthy();
  });

  it('muestra un mensaje junto al campo sin turno y sin imperativos cuando responde 422 [US-219 AC-4]', async () => {
    bff.responderSeguimiento({
      status: 422,
      cuerpo: { error: 'VALIDACION', message: 'x', traceId: 'req_422' },
    });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    await preguntar(usuario, PREGUNTA);

    expect(await screen.findByText(followUp.noProcesable)).toBeTruthy();
    expect(screen.queryByRole('article', { name: /Pregunta/ })).toBeNull();
    expect(followUp.noProcesable).not.toMatch(IMPERATIVOS);
  });

  it('declara el historial como región viva educada y el campo con etiqueta visible [US-219 AC-5]', async () => {
    await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);

    const historial = screen.getByRole('log', { name: followUp.historial });
    expect(historial.getAttribute('aria-live')).toBe('polite');
    const campo = screen.getByLabelText(followUp.campo);
    expect(document.querySelector(`label[for="${campo.id}"]`)?.textContent).toBe(followUp.campo);
  });

  it('llega al campo con Tab y envía la pregunta con Enter [US-219 AC-5]', async () => {
    bff.responderSeguimiento({ status: 201, cuerpo: seguimientoTurno });
    const usuario = await analizarYAbrirHilo(bff, conEvidenciaTresOpciones);
    const campo = screen.getByLabelText(followUp.campo);

    for (let i = 0; i < 40 && document.activeElement !== campo; i += 1) await usuario.tab();
    expect(document.activeElement).toBe(campo);
    await usuario.keyboard(`${PREGUNTA}{Enter}`);

    expect(await screen.findByRole('article', { name: /Pregunta 1/ })).toBeTruthy();
    expect(bff.peticionesDeSeguimiento).toHaveLength(1);
  });
});
