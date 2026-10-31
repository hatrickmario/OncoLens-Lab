// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checklistF_M1,
  checklistF_M2,
  checklistTipoNoHabilitado,
  conEvidencia,
  crearBffAnalisisSimulado,
  errorInterno,
} from '../support/msw/evidence-analyses';
import { evidence, ID_PACIENTE, montarPanel, PREGUNTA_DE_PRUEBA } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

const TITULO_SEIS = 'Faltan 6 datos críticos para este tipo de cáncer';
const NO_VERIFICADOS = 'No se pudieron verificar los datos críticos';
const PROHIBIDOS = /recomend|debe recibir|tratamiento indicado|primera elecci[oó]n/i;
const BOTON = () => screen.getByRole('button', { name: evidence.formulario.analizar });

async function escribirPregunta() {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText(evidence.formulario.pregunta), PREGUNTA_DE_PRUEBA);
  return usuario;
}

describe('EvidencePanel · aviso de faltantes', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra el aviso con los seis faltantes y no envía ningún análisis cuando se carga el panel de F-M2 [US-005 AC-1]', async () => {
    bff.responderChecklist({ status: 200, cuerpo: checklistF_M2 });

    montarPanel();

    const titulo = await screen.findByText(TITULO_SEIS);
    const aviso = titulo.closest('[role="status"]') as HTMLElement;
    expect(aviso).toBeTruthy();
    const lista = within(aviso).getByRole('list');
    expect(within(lista).getAllByRole('listitem')).toHaveLength(6);
    for (const etiqueta of ['Grado', 'Ki-67', 'BRCA germinal']) {
      expect(
        within(lista).getByRole('link', { name: `Registrar ${etiqueta} en la ficha` }),
      ).toBeTruthy();
    }
    expect(
      within(aviso).getByText(
        'El análisis puede hacerse igual; los criterios de aplicabilidad que dependan de esos datos saldrán como «Desconocido» y el orden por aplicabilidad puede cambiar al registrarlos.',
      ),
    ).toBeTruthy();
    expect(aviso.textContent).not.toMatch(PROHIBIDOS);
    expect(bff.cuerpos).toEqual([]);
  });

  it('envía un solo POST con continueWithWarning true cuando hay faltantes y el oncólogo pulsa el botón habilitado [US-005 AC-2]', async () => {
    bff.responderChecklist({ status: 200, cuerpo: checklistF_M2 });
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();
    await screen.findByText(TITULO_SEIS);
    expect((BOTON() as HTMLButtonElement).disabled).toBe(false);
    const usuario = await escribirPregunta();

    await usuario.click(BOTON());

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect(bff.cuerpos[0]).toMatchObject({ patientId: ID_PACIENTE, continueWithWarning: true });
  });

  it('relee el checklist antes de cada análisis y usa la lectura más reciente [US-005 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();
    await waitFor(() => expect(bff.lecturasDelChecklist).toHaveLength(1));
    bff.responderChecklist({ status: 200, cuerpo: checklistF_M2 });
    const usuario = await escribirPregunta();

    await usuario.click(BOTON());

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect(bff.lecturasDelChecklist).toHaveLength(2);
    expect(bff.cuerpos[0]).toMatchObject({ continueWithWarning: true });
  });

  it('envía continueWithWarning false y no muestra el bloque cuando F-M1 no tiene faltantes [US-005 AC-4]', async () => {
    bff.responderChecklist({ status: 200, cuerpo: checklistF_M1 });
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();
    await waitFor(() => expect(bff.lecturasDelChecklist).toHaveLength(1));
    const usuario = await escribirPregunta();

    await usuario.click(BOTON());

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect(screen.queryByText(/Falta(n)? \d+ dato/)).toBeNull();
    expect(screen.queryByText(NO_VERIFICADOS)).toBeNull();
    expect(bff.cuerpos[0]).toMatchObject({ continueWithWarning: false });
  });

  it('muestra «No se pudieron verificar los datos críticos», mantiene el botón habilitado y envía true cuando el checklist responde 500 [US-005 AC-5]', async () => {
    bff.responderChecklist({ status: 500, cuerpo: errorInterno });
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();

    const aviso = (await screen.findByText(NO_VERIFICADOS)).closest('[role="status"]');
    expect(aviso).toBeTruthy();
    expect(screen.queryByText(/Falta(n)? \d+ dato/)).toBeNull();
    expect((BOTON() as HTMLButtonElement).disabled).toBe(false);
    const usuario = await escribirPregunta();
    await usuario.click(BOTON());

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect(bff.cuerpos[0]).toMatchObject({ continueWithWarning: true });
  });

  it('degrada igual con continueWithWarning true cuando falla la red del checklist [US-005 AC-5]', async () => {
    bff.responderChecklist({ status: 0, cuerpo: {}, red: true });
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();
    expect(await screen.findByText(NO_VERIFICADOS)).toBeTruthy();
    const usuario = await escribirPregunta();

    await usuario.click(BOTON());

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect(bff.cuerpos[0]).toMatchObject({ continueWithWarning: true });
  });

  it('no muestra el bloque y sí el aviso de tipo no habilitado cuando cancerTypeEnabled es false [US-005 AC-6]', async () => {
    bff.responderChecklist({ status: 200, cuerpo: checklistTipoNoHabilitado });

    montarPanel();

    expect(
      await screen.findByText('Tipo de cáncer fuera del alcance del piloto: sin análisis con IA'),
    ).toBeTruthy();
    expect(screen.queryByText(/Falta(n)? \d+ dato/)).toBeNull();
    expect(screen.queryByText(NO_VERIFICADOS)).toBeNull();
  });

  it('vuelve al login con sesión expirada cuando el checklist responde 401 [US-005 AC-5]', async () => {
    bff.responderChecklist({
      status: 401,
      cuerpo: { error: 'NO_AUTENTICADO', message: 'Sesión no válida.', traceId: 'req_1' },
    });

    montarPanel();

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it('redirige a /login?motivo=expirada y no envía el POST cuando el checklist responde 401 al pulsar Analizar tras una lectura inicial 200 [US-005 AC-5]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    montarPanel();
    await waitFor(() => expect(bff.lecturasDelChecklist).toHaveLength(1));
    bff.responderChecklist({
      status: 401,
      cuerpo: { error: 'NO_AUTENTICADO', message: 'Sesión no válida.', traceId: 'req_1' },
    });
    const usuario = await escribirPregunta();

    await usuario.click(BOTON());

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/login?motivo=expirada');
    expect(bff.cuerpos).toEqual([]);
  });

  it('apunta cada enlace a su sección de la ficha o al encabezado principal sin enviar análisis [US-005 AC-3]', async () => {
    const conDestinos = {
      ...checklistF_M2,
      items: checklistF_M2.items.filter((i) =>
        ['Grado', 'Ki-67', 'Estado menopáusico'].includes(i.label),
      ),
    };
    bff.responderChecklist({ status: 200, cuerpo: conDestinos });
    montarPanel();
    await screen.findByText('Faltan 3 datos críticos para este tipo de cáncer');

    const href = (etiqueta: string) =>
      screen.getByRole('link', { name: `Registrar ${etiqueta} en la ficha` }).getAttribute('href');

    expect(href('Ki-67')).toBe(`/pacientes/${ID_PACIENTE}#biomarcadores`);
    expect(href('Grado')).toBe(`/pacientes/${ID_PACIENTE}#diagnostico`);
    expect(href('Estado menopáusico')).toBe(`/pacientes/${ID_PACIENTE}`);
    expect(bff.cuerpos).toEqual([]);
  });

  it('asocia el resumen al botón con aria-describedby y recorre los enlaces con Tab antes del botón [US-005 AC-7]', async () => {
    bff.responderChecklist({ status: 200, cuerpo: checklistF_M2 });
    montarPanel();
    const resumen = await screen.findByText(TITULO_SEIS);
    expect(resumen.id).not.toBe('');
    expect(BOTON().getAttribute('aria-describedby')).toBe(resumen.id);

    const usuario = userEvent.setup();
    screen.getByLabelText(evidence.formulario.pregunta).focus();
    await usuario.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Registrar Grado en la ficha' }),
    );
    for (let i = 0; i < 6; i++) await usuario.tab();
    expect(document.activeElement).toBe(BOTON());
    expect(bff.cuerpos).toEqual([]);
  });

  it('usa el singular y mantiene el botón habilitado cuando falta un solo dato [US-005 AC-1]', async () => {
    const uno = { ...checklistF_M2, items: checklistF_M2.items.slice(1, 2) };
    bff.responderChecklist({ status: 200, cuerpo: uno });

    montarPanel();

    expect(await screen.findByText('Falta 1 dato crítico para este tipo de cáncer')).toBeTruthy();
    expect((BOTON() as HTMLButtonElement).disabled).toBe(false);
  });

  it('no asocia aria-describedby al botón cuando no hay aviso [US-005 AC-7]', async () => {
    montarPanel();
    await waitFor(() => expect(bff.lecturasDelChecklist).toHaveLength(1));

    expect(BOTON().hasAttribute('aria-describedby')).toBe(false);
  });
});
