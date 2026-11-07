// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import AnalisisPage from '../../app/(dashboard)/pacientes/[id]/analisis/page';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import { errorInterno, errorNoAutenticado, fichaDelDoctor } from '../support/ficha-simulado';
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
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));

const bff = crearBffConversacionSimulado();
const ENTORNO = {
  CLINICAL_API_URL: URL_CLINICAL_API,
  WEB_ALLOWED_ORIGIN: ORIGEN_PERMITIDO,
  WEB_UPSTREAM_TIMEOUT_MS: '5000',
  WEB_HOME_PATH: '/pacientes',
};

async function abrirPagina() {
  const pagina = await AnalisisPage({ params: Promise.resolve({ id: fichaDelDoctor.id }) });
  render(pagina);
  return pagina;
}

const botonesGuiados = () =>
  within(screen.getByRole('group', { name: textos.guiadasTitulo })).getAllByRole('button');

describe('Preguntas guiadas', () => {
  beforeAll(() => {
    Object.assign(process.env, ENTORNO);
    bff.iniciar();
  });
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('ofrece de 3 a 4 botones con el tema del caso y envía el texto exacto del pulsado como turno normal [US-267 AC-8]', async () => {
    bff.responderFicha({ status: 200, cuerpo: fichaDelDoctor });
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso));
    const usuario = userEvent.setup();
    await abrirPagina();

    const botones = botonesGuiados();
    expect(botones.length).toBeGreaterThanOrEqual(3);
    expect(botones.length).toBeLessThanOrEqual(4);
    const deEvidencia = botones.find((b) => /^¿Qué evidencia hay para Cáncer de mama\?$/.test(b.textContent!));
    expect(deEvidencia).toBeTruthy();

    await usuario.click(deEvidencia!);

    await buscarTarjetas();
    expect(bff.turnos.map((t) => t.cuerpo)).toEqual([
      { question: '¿Qué evidencia hay para Cáncer de mama?' },
    ]);
    expect(Object.keys(bff.turnos[0]!.cuerpo)).toEqual(['question']);
    expect(new URL(bff.turnos[0]!.url).search).toBe('');
    expect(screen.queryByRole('group', { name: textos.guiadasTitulo })).toBeNull();
  });

  it('vuelve a ofrecerlas con el hilo vacío cuando se pulsa Nueva conversación [US-267 AC-8]', async () => {
    bff.responderFicha({ status: 200, cuerpo: fichaDelDoctor });
    bff.responderTurnos(respuestaDeTurno(turnoDeCaso));
    const usuario = userEvent.setup();
    await abrirPagina();
    await preguntar(usuario, 'Primera');
    await buscarTarjetas();
    await preguntar(usuario, 'Segunda');
    await buscarTarjetas().then((a) => expect(a).toHaveLength(2));

    await usuario.click(screen.getByRole('button', { name: textos.nuevaConversacion }));

    expect(cuantasTarjetas()).toBe(0);
    expect(botonesGuiados().length).toBeGreaterThanOrEqual(3);
  });

  it('pasa al panel solo la lista de textos y no la identificación ni el resumen [US-267 AC-10]', async () => {
    bff.responderFicha({ status: 200, cuerpo: fichaDelDoctor });

    const pagina = await abrirPagina();

    const serializada = JSON.stringify(pagina);
    for (const ajeno of [fichaDelDoctor.identification.fullName, fichaDelDoctor.identification.nationalId]) {
      expect(serializada).not.toContain(ajeno);
    }
    expect(serializada).not.toContain('recentBiomarkers');
    expect(document.body.textContent).not.toContain(fichaDelDoctor.identification.fullName);
    expect(serializada).toContain('preguntasGuiadas');
  });

  it('no ofrece botones y deja operable el campo cuando la lectura del resumen falla [US-267 AC-10]', async () => {
    for (const respuesta of [
      { status: 500, cuerpo: errorInterno },
      { status: 403, cuerpo: errorOptOut },
      { status: 401, cuerpo: errorNoAutenticado },
    ]) {
      bff.responderFicha(respuesta);

      await abrirPagina();

      expect(screen.queryByRole('group', { name: textos.guiadasTitulo })).toBeNull();
      expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).disabled).toBe(false);
      expect((screen.getByRole('button', { name: textos.preguntar }) as HTMLButtonElement).disabled).toBe(false);
      cleanup();
    }
  });

  it('deshabilita los botones y no envía nada cuando disabled es true [US-267 RN-15]', async () => {
    const usuario = userEvent.setup();
    montarPanel({ disabled: true, preguntasGuiadas: ['¿Qué evidencia hay para Cáncer de mama?'] });

    const [boton] = botonesGuiados();
    await usuario.click(boton!);

    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(bff.turnos).toHaveLength(0);
    expect(bff.aperturas).toHaveLength(0);
  });

  it('deshabilita los botones cuando el turno responde opt-out [US-267 RN-15]', async () => {
    bff.responderTurnos({ status: 403, cuerpo: errorOptOut });
    const usuario = userEvent.setup();
    montarPanel({ preguntasGuiadas: ['Pregunta guiada A', 'Pregunta guiada B', 'Pregunta guiada C'] });

    await usuario.click(screen.getByRole('button', { name: 'Pregunta guiada A' }));

    await screen.findByRole('group', { name: textos.guiadasTitulo });
    for (const boton of botonesGuiados()) expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(bff.turnos).toHaveLength(1);
  });
});
