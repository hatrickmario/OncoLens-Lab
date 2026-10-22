// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BusquedaDePacientes } from '../../components/organisms/busqueda-de-pacientes';
import { mensajes } from '../../lib/mensajes';
import {
  crearBffBusquedaSimulado,
  errorInterno,
  errorNoAutenticado,
  otroPaciente,
  paginaDelDoctor,
  paginaVacia,
} from '../support/pacientes-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { pacientes } = mensajes();
const bff = crearBffBusquedaSimulado();
const LISTADO = 'Listado del servidor';

function montar() {
  render(
    <BusquedaDePacientes textos={pacientes}>
      <p>{LISTADO}</p>
    </BusquedaDePacientes>,
  );
  return userEvent.setup();
}

async function buscarPorDocumento(usuario: ReturnType<typeof userEvent.setup>, numero: string) {
  await usuario.selectOptions(
    screen.getByLabelText(pacientes.busqueda.tipoDocumento),
    pacientes.tiposDeDocumento.sintetico,
  );
  await usuario.type(screen.getByLabelText(pacientes.busqueda.numero), numero);
  await usuario.click(screen.getByRole('button', { name: pacientes.busqueda.buscar }));
}

async function buscarPorNombre(usuario: ReturnType<typeof userEvent.setup>, nombre: string) {
  await usuario.click(screen.getByRole('tab', { name: pacientes.busqueda.porNombre }));
  await usuario.type(screen.getByLabelText(pacientes.busqueda.nombre), nombre);
  await usuario.click(screen.getByRole('button', { name: pacientes.busqueda.buscar }));
}

describe('BusquedaDePacientes', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('envía la identidad en el cuerpo de POST /api/patients/search y nunca en la URL cuando se busca por documento [US-048 AC-5]', async () => {
    bff.responder(200, paginaDelDoctor);
    const usuario = montar();

    await buscarPorDocumento(usuario, 'SINT-0000001');

    const resultados = await screen.findByRole('table');
    expect(within(resultados).getByText('•••• 01')).toBeTruthy();
    expect(bff.peticiones).toHaveLength(1);
    const peticion = bff.peticiones[0]!;
    expect(peticion.metodo).toBe('POST');
    expect(peticion.cuerpo).toEqual({ idType: 'sintetico', nationalId: 'SINT-0000001' });
    expect(new URL(peticion.url).search).toBe('');
    expect(peticion.url).not.toContain('SINT-0000001');
    expect(window.location.href).not.toContain('SINT-0000001');
  });

  it('envía solo el nombre en el cuerpo cuando se busca por la pestaña Por nombre [US-048 AC-3]', async () => {
    bff.responder(200, paginaDelDoctor);
    const usuario = montar();

    await buscarPorNombre(usuario, 'Prueba Sintética 1');

    await screen.findByRole('table');
    expect(bff.peticiones.map((p) => p.cuerpo)).toEqual([{ name: 'Prueba Sintética 1' }]);
    expect(new URL(bff.peticiones[0]!.url).search).toBe('');
  });

  it('muestra No hay pacientes con ese documento en role=status cuando no hay resultados [US-048 AC-2]', async () => {
    bff.responder(200, paginaVacia);
    const usuario = montar();

    await buscarPorDocumento(usuario, '123');

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toBe('No hay pacientes con ese documento.');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('muestra No hay pacientes con ese nombre en role=status cuando no hay resultados [US-048 AC-3]', async () => {
    bff.responder(200, paginaVacia);
    const usuario = montar();

    await buscarPorNombre(usuario, 'Rondón');

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toBe('No hay pacientes con ese nombre.');
  });

  it('muestra la ayuda Escribe el nombre completo en la pestaña Por nombre [US-048 AC-3]', async () => {
    const usuario = montar();
    expect(screen.queryByText('Escribe el nombre completo')).toBeNull();

    await usuario.click(screen.getByRole('tab', { name: pacientes.busqueda.porNombre }));

    const ayuda = screen.getByText('Escribe el nombre completo');
    const campo = screen.getByLabelText(pacientes.busqueda.nombre);
    expect(campo.getAttribute('aria-describedby')).toContain(ayuda.id);
  });

  it('avisa que hay varios pacientes con ese nombre y los distingue por máscara y año cuando la búsqueda devuelve homónimos [US-048 AC-3]', async () => {
    bff.responder(200, {
      ...paginaDelDoctor,
      items: [...paginaDelDoctor.items, otroPaciente],
      total: 2,
    });
    const usuario = montar();

    await buscarPorNombre(usuario, 'Prueba Sintética');

    const estado = await screen.findByRole('status');
    expect(estado.textContent).toContain('Hay 2 pacientes con ese nombre');
    expect(estado.textContent).toContain('documento enmascarado y el año de nacimiento');
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('vuelve al listado cuando se pulsa Limpiar búsqueda [US-048 AC-2]', async () => {
    bff.responder(200, paginaDelDoctor);
    const usuario = montar();
    expect(screen.getByText(LISTADO)).toBeTruthy();

    await buscarPorDocumento(usuario, 'SINT-0000001');
    await screen.findByRole('table');
    expect(screen.queryByText(LISTADO)).toBeNull();

    await usuario.click(screen.getByRole('button', { name: pacientes.busqueda.limpiar }));

    expect(screen.getByText(LISTADO)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('muestra el error con el código de traza cuando la búsqueda responde 500 [US-048 AC-6]', async () => {
    bff.responder(500, errorInterno);
    const usuario = montar();

    await buscarPorDocumento(usuario, 'SINT-0000001');

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe(
      'No pudimos completar la búsqueda. Intenta de nuevo. Código de traza req_d4e5f6a7',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirige a /login?motivo=expirada cuando la búsqueda responde 401 [US-048 AC-6]', async () => {
    bff.responder(401, errorNoAutenticado);
    const usuario = montar();

    await buscarPorDocumento(usuario, 'SINT-0000001');

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
  });

  it('no envía nada y pide completar el campo cuando el documento está vacío [US-048 AC-2]', async () => {
    const usuario = montar();

    await usuario.click(screen.getByRole('button', { name: pacientes.busqueda.buscar }));

    expect((await screen.findByRole('alert')).textContent).toBe(pacientes.busqueda.invalido);
    expect(bff.peticiones).toEqual([]);
  });
});
