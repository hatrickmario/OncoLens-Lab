// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mensajes, rellenar } from '../../lib/mensajes';
import {
  crearBffDeFormulariosSimulado,
  diagnosticoCreado,
  errorGradacion,
  errorInterno,
  errorPacienteEgresado,
  errorValorFueraDeRango,
  fichaDeProstata,
  fichaDelDoctor,
  fichaEgresada,
  fichaSinDiagnostico,
  montarFichaConFormularios,
  montarFichaDeAdministrador,
  opcionesMama,
  opcionesProstata,
  opcionesSinDiagnostico,
} from '../support/registro-manual-formularios-ui';

const enrutador = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => enrutador }));

const { registroManual, caso } = mensajes();
const t = registroManual.diagnostico;
const g = t.gradacion;
const bff = crearBffDeFormulariosSimulado();

type Usuario = ReturnType<typeof userEvent.setup>;

/** Diagnóstico vigente de mama sin gradación (`grade = null`), como F-M2 antes de registrar el grado. */
const fichaSinGrado = {
  ...fichaDelDoctor,
  diagnosis: { ...fichaDelDoctor.diagnosis, grade: null, gradings: [] },
};

async function abrir(usuario: Usuario) {
  const disparador = await screen.findByRole('button', { name: t.accion });
  await usuario.click(disparador);
  const dialogo = await screen.findByRole('dialog', { name: t.titulo });
  await waitFor(() => expect(within(dialogo).queryByText(t.cargando)).toBeNull());
  return { disparador, dialogo };
}

const guardar = (dialogo: HTMLElement) =>
  within(dialogo).getByRole('button', { name: caso.registro.guardar });

async function cambiarValorFuncional(usuario: Usuario, dialogo: HTMLElement, valor: string) {
  const campo = within(dialogo).getByLabelText(t.valorFuncional);
  await usuario.clear(campo);
  await usuario.type(campo, valor);
}

describe('Completar el diagnóstico a mano (US-111)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  beforeEach(() => bff.opciones());
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    enrutador.replace.mockClear();
    enrutador.refresh.mockClear();
  });

  it('muestra los valores vigentes, el aviso de corrección y el grado de solo lectura, y envía solo la gradación [US-111 AC-3]', async () => {
    bff.crearDiagnostico(diagnosticoCreado);
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaSinGrado);
    const { disparador, dialogo } = await abrir(usuario);
    const d = within(dialogo);

    expect((d.getByLabelText(t.tipoDeCancer) as HTMLSelectElement).value).toBe('mama');
    expect((d.getByLabelText(t.histologia) as HTMLInputElement).value).toBe(
      'carcinoma ductal infiltrante',
    );
    expect((d.getByLabelText(t.sistemaDeEstadio) as HTMLSelectElement).value).toBe('TNM_8');
    expect((d.getByLabelText(t.valorDeEstadio) as HTMLInputElement).value).toBe('IIA');
    expect((d.getByLabelText(t.escalaFuncional) as HTMLSelectElement).value).toBe('ECOG');
    expect((d.getByLabelText(t.valorFuncional) as HTMLInputElement).value).toBe('1');
    expect((d.getByLabelText(t.fecha) as HTMLInputElement).value).toBe('2026-09-01');
    expect(d.getByText(t.avisoDeCorreccion)).toBeTruthy();
    expect(d.getByText(`${t.gradoDerivado}: ${t.sinGrado}`)).toBeTruthy();
    expect(d.queryByRole('textbox', { name: new RegExp(t.gradoDerivado) })).toBeNull();

    await usuario.selectOptions(d.getByLabelText(g.nottingham), '2');
    await usuario.click(guardar(dialogo));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envios = bff.peticiones.filter((p) => p.metodo === 'POST');
    expect(envios).toHaveLength(1);
    expect(envios[0]?.ruta).toBe(`/api/patients/${fichaSinGrado.id}/diagnoses`);
    expect(envios[0]?.cuerpo).toEqual({
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 },
    });
    expect(enrutador.refresh).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(disparador);
  });

  it('ofrece patrones, espécimen y alcance de Gleason en próstata, sin Nottingham ni puntaje editable [US-111 AC-3]', async () => {
    bff.opciones(opcionesProstata);
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaDeProstata);
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    expect(d.getByLabelText(g.patronPrimario)).toBeTruthy();
    expect(d.getByLabelText(g.patronSecundario)).toBeTruthy();
    expect(d.getByLabelText(g.especimen)).toBeTruthy();
    expect(d.getByLabelText(g.alcance)).toBeTruthy();
    expect(d.queryByLabelText(g.nottingham)).toBeNull();
    expect(d.queryByLabelText(/puntaje|score|grupo isup/i)).toBeNull();
  });

  it('deshabilita Guardar sin cambios y exige los mínimos sin vigente [US-111 AC-3]', async () => {
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaSinGrado);
    const primero = await abrir(usuario);

    expect((guardar(primero.dialogo) as HTMLButtonElement).disabled).toBe(true);
    expect(within(primero.dialogo).getByText(t.sinCambios)).toBeTruthy();
    expect(bff.peticiones.filter((p) => p.metodo === 'POST')).toHaveLength(0);
    cleanup();

    bff.opciones(opcionesSinDiagnostico);
    montarFichaConFormularios(fichaSinDiagnostico);
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    expect(d.queryByText(t.avisoDeCorreccion)).toBeNull();
    await usuario.click(guardar(dialogo));

    for (const etiqueta of [t.tipoDeCancer, t.sistemaDeEstadio, t.valorDeEstadio, t.fecha]) {
      const campo = d.getByLabelText(etiqueta);
      expect(campo.getAttribute('aria-invalid')).toBe('true');
      expect(
        document.getElementById(campo.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe(registroManual.errores.obligatorio);
    }
    expect(bff.peticiones.filter((p) => p.metodo === 'POST')).toHaveLength(0);
  });

  it('relee las opciones al reabrir el diálogo y no muestra las anteriores cuando cambió el tipo de cáncer [US-111 AC-3]', async () => {
    bff.opciones(opcionesSinDiagnostico);
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaSinDiagnostico);
    const primera = await abrir(usuario);
    expect(within(primera.dialogo).getByLabelText(g.sistema)).toBeTruthy();
    await usuario.keyboard('{Escape}');

    bff.opciones(opcionesMama);
    const { dialogo } = await abrir(usuario);

    expect(within(dialogo).queryByLabelText(g.sistema)).toBeNull();
    expect(within(dialogo).getByLabelText(g.nottingham)).toBeTruthy();
  });

  it('abre con el foco en la gradación con ?item=grado y solo el formulario de su entidad [US-111 AC-2]', async () => {
    montarFichaConFormularios(fichaSinGrado, 'grado');

    const dialogo = await screen.findByRole('dialog', { name: t.titulo });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialogo).getByLabelText(g.nottingham)),
    );
    expect(screen.queryByRole('dialog', { name: registroManual.biomarcador.titulo })).toBeNull();
  });

  it('abre solo el formulario de biomarcador con ?item=ki67 en la ficha [US-111 AC-2]', async () => {
    montarFichaConFormularios(fichaSinGrado, 'ki67');

    const dialogo = await screen.findByRole('dialog', { name: registroManual.biomarcador.titulo });
    expect(
      (within(dialogo).getByLabelText(registroManual.biomarcador.nombre) as HTMLInputElement).value,
    ).toBe('Ki-67');
    expect(screen.queryByRole('dialog', { name: t.titulo })).toBeNull();
  });

  it('pinta el 422 junto al campo de field, egresado arriba y 5xx sin perder lo escrito [US-111 AC-4]', async () => {
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaSinGrado);
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    bff.crearDiagnostico(errorValorFueraDeRango, 422);
    await cambiarValorFuncional(usuario, dialogo, '7');
    await usuario.click(guardar(dialogo));

    const campo = await waitFor(() => {
      const c = d.getByLabelText(t.valorFuncional);
      expect(c.getAttribute('aria-invalid')).toBe('true');
      return c;
    });
    expect(document.getElementById(campo.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      registroManual.errores.valorFueraDeRango,
    );
    expect((campo as HTMLInputElement).value).toBe('7');
    expect(enrutador.refresh).not.toHaveBeenCalled();

    bff.crearDiagnostico(errorGradacion, 422);
    await usuario.selectOptions(d.getByLabelText(g.nottingham), '3');
    await usuario.click(guardar(dialogo));
    const grupo = await d.findByRole('group', { name: g.titulo });
    expect(within(grupo).getByText(registroManual.errores.gradacionIncoherente)).toBeTruthy();

    bff.crearDiagnostico(errorPacienteEgresado, 422);
    await usuario.click(guardar(dialogo));
    expect((await d.findByRole('alert')).textContent).toBe(registroManual.errores.egresado);

    bff.crearDiagnostico(errorInterno, 500);
    await usuario.click(guardar(dialogo));
    await waitFor(() =>
      expect(d.getByRole('alert').textContent).toBe(registroManual.errores.generico),
    );
    expect((d.getByLabelText(t.valorFuncional) as HTMLInputElement).value).toBe('7');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('atrapa el foco, anuncia los errores en aria-live y Esc devuelve el foco [US-111 AC-5]', async () => {
    bff.opciones(opcionesSinDiagnostico);
    const usuario = userEvent.setup();
    montarFichaConFormularios(fichaSinDiagnostico);
    const { disparador, dialogo } = await abrir(usuario);

    await usuario.click(guardar(dialogo));

    const anuncio = within(dialogo).getByText(
      rellenar(registroManual.anuncio.varios, { cantidad: 4 }),
    );
    expect(anuncio.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
    for (let i = 0; i < 18; i += 1) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });

  it('no ofrece las acciones de registro al administrador [US-111 AC-5]', () => {
    montarFichaDeAdministrador();

    expect(screen.queryByRole('button', { name: t.accion })).toBeNull();
    expect(screen.queryByRole('button', { name: registroManual.biomarcador.accion })).toBeNull();
  });

  it('deshabilita las acciones con el aviso de egreso cuando el paciente está egresado [US-111 AC-4]', () => {
    montarFichaConFormularios(fichaEgresada);

    for (const nombre of [t.accion, registroManual.biomarcador.accion]) {
      expect((screen.getByRole('button', { name: nombre }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    }
  });
});
