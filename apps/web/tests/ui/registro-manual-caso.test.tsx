// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mensajes } from '../../lib/mensajes';
import {
  crearBffDeRegistroSimulado,
  errorCampo,
  errorPermisoDenegado,
  montarCasoConRegistro,
  tratamientoCreado,
  tratamientoManual,
  tratamientoNoMapeado,
} from '../support/registro-manual-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { registro, secciones } = mensajes().caso;
const { tratamiento, atributo } = registro;
const bff = crearBffDeRegistroSimulado();

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirTratamiento(usuario: Usuario) {
  const disparador = await screen.findByRole('button', { name: tratamiento.accion });
  await usuario.click(disparador);
  return { disparador, dialogo: await screen.findByRole('dialog', { name: tratamiento.titulo }) };
}

async function abrirAtributo(usuario: Usuario) {
  const disparador = await screen.findByRole('button', { name: atributo.accion });
  await usuario.click(disparador);
  return { disparador, dialogo: await screen.findByRole('dialog', { name: atributo.titulo }) };
}

describe('Registro manual de tratamientos previos y atributos en la vista de caso', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('envía el cuerpo del contrato, cierra el diálogo y muestra la fila sin recargar la página [US-094 AC-6]', async () => {
    bff.crearTratamiento(tratamientoCreado);
    const usuario = userEvent.setup();
    montarCasoConRegistro();
    const { disparador, dialogo } = await abrirTratamiento(usuario);

    await usuario.type(within(dialogo).getByLabelText(tratamiento.linea), '2');
    await usuario.selectOptions(
      within(dialogo).getByLabelText(tratamiento.contexto),
      'Segunda línea metastásica',
    );
    await usuario.type(within(dialogo).getByLabelText(tratamiento.esquema), 'Leuprorelina');
    fireEvent.change(within(dialogo).getByLabelText(tratamiento.inicio), {
      target: { value: '2026-08-01' },
    });
    await usuario.click(within(dialogo).getByLabelText(tratamiento.enCurso));
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    const fila = await screen.findByRole('row', { name: /Leuprorelina/ });
    expect(fila.textContent).toContain('L02AE02');
    expect(within(fila).getByText('En curso')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disparador);
    const envios = bff.peticiones.filter((p) => p.metodo === 'POST');
    expect(envios).toHaveLength(1);
    expect(envios[0]?.cuerpo).toEqual(tratamientoManual);
    expect(bff.peticiones.filter((p) => p.ruta.endsWith('/case'))).toHaveLength(2);
    expect(bff.peticiones.every((p) => p.ruta.startsWith('/api/'))).toBe(true);
  });

  it('muestra el aviso de término sin código y la fila no mapeada cuando el servidor responde no_mapeado [US-094 AC-6]', async () => {
    bff.crearTratamiento(tratamientoNoMapeado);
    const usuario = userEvent.setup();
    montarCasoConRegistro();
    const { dialogo } = await abrirTratamiento(usuario);

    await usuario.selectOptions(within(dialogo).getByLabelText(tratamiento.contexto), 'Otro');
    await usuario.type(
      within(dialogo).getByLabelText(tratamiento.esquema),
      'Fármaco experimental X',
    );
    await usuario.selectOptions(
      within(dialogo).getByLabelText(tratamiento.motivoDeFin),
      'Desconocido',
    );
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toContain(tratamiento.noMapeado);
    expect(bff.peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toEqual({
      setting: 'otro',
      regimenName: 'Fármaco experimental X',
      ongoing: false,
      endReason: 'desconocido',
    });
    await usuario.click(screen.getByRole('button', { name: registro.cerrar }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const tratamientos = within(screen.getByRole('region', { name: secciones.tratamientos }));
    const fila = await tratamientos.findByRole('row', { name: /Fármaco experimental X/ });
    expect(fila.textContent).toContain(mensajes().caso.noMapeado);
  });

  it('lista solo los atributos del catálogo, anuncia el 422 junto al campo y Esc devuelve el foco al disparador [US-094 AC-6]', async () => {
    bff.permitidos();
    bff.rechazarAtributo(422, errorCampo);
    const usuario = userEvent.setup();
    montarCasoConRegistro();
    const { disparador, dialogo } = await abrirAtributo(usuario);

    const selector = await within(dialogo).findByLabelText(atributo.atributo);
    const opciones = within(selector)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toEqual([atributo.elegir, 'Estado de castración', 'Sitios metastásicos']);
    await usuario.selectOptions(selector, 'Estado de castración');
    await usuario.selectOptions(within(dialogo).getByLabelText(atributo.valor), 'Castrado');
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    const mensaje = await within(dialogo).findByText(registro.errores.valorFueraDeCatalogo);
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
    const campo = within(dialogo).getByLabelText(atributo.valor);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(bff.peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toEqual({
      attributeKey: 'estado_castracion',
      value: 'castrado',
    });

    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(disparador);
  });

  it('deshabilita ambos botones con la explicación de egresado y no hace peticiones de registro cuando el paciente está egresado', async () => {
    montarCasoConRegistro(true);

    const botones = [
      await screen.findByRole('button', { name: tratamiento.accion }),
      screen.getByRole('button', { name: atributo.accion }),
    ];
    for (const boton of botones) {
      expect(boton.hasAttribute('disabled')).toBe(true);
      const ayuda = document.getElementById(boton.getAttribute('aria-describedby') ?? '');
      expect(ayuda?.textContent).toBe(mensajes().ficha.correccion.egresado);
    }
    expect(bff.peticiones.map((p) => p.metodo)).toEqual(['GET']);
  });

  it('no envía y marca el esquema como obligatorio cuando se guarda sin esquema', async () => {
    const usuario = userEvent.setup();
    montarCasoConRegistro();
    const { dialogo } = await abrirTratamiento(usuario);

    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    const campo = within(dialogo).getByLabelText(tratamiento.esquema);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(within(dialogo).getAllByText(registro.errores.obligatorio).length).toBeGreaterThan(0);
    expect(bff.peticiones.filter((p) => p.metodo === 'POST')).toEqual([]);
  });

  it('explica el 403 sin detalle del servidor y deja el formulario abierto cuando la cuenta no puede registrar', async () => {
    bff.rechazarTratamiento(403, errorPermisoDenegado);
    const usuario = userEvent.setup();
    montarCasoConRegistro();
    const { dialogo } = await abrirTratamiento(usuario);

    await usuario.type(within(dialogo).getByLabelText(tratamiento.esquema), 'Leuprorelina');
    await usuario.selectOptions(
      within(dialogo).getByLabelText(tratamiento.motivoDeFin),
      'Desconocido',
    );
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    expect(await within(dialogo).findByText(registro.errores.permiso)).toBeTruthy();
    expect(screen.queryByText(errorPermisoDenegado.message)).toBeNull();
    expect(screen.getByRole('dialog', { name: tratamiento.titulo })).toBeTruthy();
  });
});
