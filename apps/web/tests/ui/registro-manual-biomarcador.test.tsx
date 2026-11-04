// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import biomarcadorManual from '../../../../contracts/examples/biomarker-manual.json';
import { mensajes, rellenar } from '../../lib/mensajes';
import {
  biomarcadorCreado,
  biomarcadorNoMapeado,
  crearBffDeFormulariosSimulado,
  errorInterno,
  errorNoAutenticado,
  ID_DEL_CASO,
  montarCasoConFormularios,
} from '../support/registro-manual-formularios-ui';

const enrutador = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => enrutador }));

const { registroManual, caso } = mensajes();
const t = registroManual.biomarcador;
const bff = crearBffDeFormulariosSimulado();

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrir(usuario: Usuario) {
  const disparador = await screen.findByRole('button', { name: t.accion });
  await usuario.click(disparador);
  return { disparador, dialogo: await screen.findByRole('dialog', { name: t.titulo }) };
}

const opcionDelCatalogo = (dialogo: HTMLElement, termino: string) =>
  dialogo.querySelector(`datalist option[value="${termino}"]`);

async function llenar(usuario: Usuario, dialogo: HTMLElement, nombre: string, valor: string) {
  const d = within(dialogo);
  await usuario.type(d.getByLabelText(t.nombre), nombre);
  await usuario.type(d.getByLabelText(t.valor), valor);
  fireEvent.change(d.getByLabelText(t.fecha), { target: { value: '2026-09-10' } });
}

describe('Registro manual de un biomarcador (US-111)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  beforeEach(() => bff.opciones());
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    enrutador.replace.mockClear();
    enrutador.refresh.mockClear();
  });

  it('registra Ki-67 elegido del autocompletado y avisa al guardar [US-111 AC-1]', async () => {
    bff.crearBiomarcador(biomarcadorCreado);
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { disparador, dialogo } = await abrir(usuario);
    const d = within(dialogo);

    await waitFor(() => expect(opcionDelCatalogo(dialogo, 'Ki-67')).not.toBeNull());
    expect(d.getByLabelText(t.nombre).getAttribute('list')).toBe(
      dialogo.querySelector('datalist')?.id,
    );
    await usuario.type(d.getByLabelText(t.nombre), 'Ki-67');
    await usuario.type(d.getByLabelText(t.valor), '20');
    await usuario.type(d.getByLabelText(t.unidad), '%');
    await usuario.selectOptions(d.getByLabelText(t.tipoDeResultado), 'cuantitativo');
    fireEvent.change(d.getByLabelText(t.fecha), { target: { value: '2026-09-10' } });
    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    const serie = await screen.findByRole('table', { name: 'Ki-67' });
    expect(within(serie).getByText(/20 %/)).toBeTruthy();
    expect(within(serie).getByText(/Registro manual/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
    const envios = bff.peticiones.filter((p) => p.metodo === 'POST');
    expect(envios).toHaveLength(1);
    expect(envios[0]?.cuerpo).toEqual(biomarcadorManual);
    expect(enrutador.refresh).toHaveBeenCalledTimes(1);
    expect(bff.peticiones.every((p) => p.ruta.startsWith('/api/'))).toBe(true);
  });

  it('avisa no_mapeado tras el 201 sin ofrecer un campo de código [US-111 AC-1]', async () => {
    bff.crearBiomarcador(biomarcadorNoMapeado);
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    await llenar(usuario, dialogo, 'marcador XYZ', 'positivo');
    await usuario.selectOptions(d.getByLabelText(t.tipoDeResultado), 'cualitativo');
    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    expect((await d.findByRole('status')).textContent).toContain(t.noMapeado);
    expect(d.queryByLabelText(/código/i)).toBeNull();
    await usuario.click(d.getByRole('button', { name: caso.registro.cerrar }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sigue usable con texto libre cuando las opciones del catálogo fallan [US-111 AC-1]', async () => {
    bff.opciones(errorInterno, 500);
    bff.crearBiomarcador(biomarcadorCreado);
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    expect(await d.findByText(t.terminosNoDisponibles)).toBeTruthy();
    await llenar(usuario, dialogo, 'Ki-67', '20');
    await usuario.selectOptions(d.getByLabelText(t.tipoDeResultado), 'cuantitativo');
    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bff.peticiones.filter((p) => p.metodo === 'POST')).toHaveLength(1);
  });

  it('abre con Ki-67 seleccionado y el foco en el valor con ?item=ki67 [US-111 AC-2]', async () => {
    montarCasoConFormularios('ki67');

    const dialogo = await screen.findByRole('dialog', { name: t.titulo });
    const d = within(dialogo);
    expect((d.getByLabelText(t.nombre) as HTMLInputElement).value).toBe('Ki-67');
    await waitFor(() => expect(document.activeElement).toBe(d.getByLabelText(t.valor)));
  });

  it.each(['desconocido', 'grado'])(
    'no abre ningún formulario con ?item=%s en la vista de caso [US-111 AC-2]',
    async (item) => {
      montarCasoConFormularios(item);

      await waitFor(() =>
        expect(bff.peticiones.some((p) => p.ruta.endsWith('/manual-entry-options'))).toBe(true),
      );
      await screen.findByRole('button', { name: t.accion });
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );

  it('quita item de la URL y devuelve el foco al encabezado de la sección con Esc [US-111 AC-2]', async () => {
    const usuario = userEvent.setup();
    montarCasoConFormularios('ki67');
    await screen.findByRole('dialog', { name: t.titulo });

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(enrutador.replace).toHaveBeenCalledWith(`/pacientes/${ID_DEL_CASO}/caso`);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: caso.secciones.series }),
    );
  });

  it('conserva lo escrito y avisa cuando el servidor falla al guardar [US-111 AC-4]', async () => {
    bff.crearBiomarcador(errorInterno, 500);
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    await llenar(usuario, dialogo, 'Ki-67', '20');
    await usuario.selectOptions(d.getByLabelText(t.tipoDeResultado), 'cuantitativo');
    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    expect((await d.findByRole('alert')).textContent).toBe(registroManual.errores.generico);
    expect((d.getByLabelText(t.valor) as HTMLInputElement).value).toBe('20');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('lleva al login con aviso de sesión expirada cuando el BFF responde 401 [US-111 AC-4]', async () => {
    bff.crearBiomarcador(errorNoAutenticado, 401);
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { dialogo } = await abrir(usuario);
    const d = within(dialogo);

    await llenar(usuario, dialogo, 'Ki-67', '20');
    await usuario.selectOptions(d.getByLabelText(t.tipoDeResultado), 'cuantitativo');
    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    await waitFor(() => expect(enrutador.replace).toHaveBeenCalledWith('/login?motivo=expirada'));
  });

  it('atrapa el foco, anuncia los errores en aria-live y Esc devuelve el foco [US-111 AC-5]', async () => {
    const usuario = userEvent.setup();
    montarCasoConFormularios();
    const { disparador, dialogo } = await abrir(usuario);
    const d = within(dialogo);

    await usuario.click(d.getByRole('button', { name: caso.registro.guardar }));

    const campo = d.getByLabelText(t.nombre);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    const idDelError = campo.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(idDelError)?.textContent).toBe(
      registroManual.errores.obligatorio,
    );
    const anuncio = d.getByText(rellenar(registroManual.anuncio.varios, { cantidad: 4 }));
    expect(anuncio.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
    for (let i = 0; i < 14; i += 1) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 14; i += 1) {
      await usuario.tab({ shift: true });
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });
});
