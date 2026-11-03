// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Biomarker,
  ClinicalNote,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { NotasClinicasDeFicha } from '../../components/organisms/notas-clinicas-de-ficha';
import { RecentBiomarkersTable } from '../../components/organisms/recent-biomarkers-table';
import { mensajes } from '../../lib/mensajes';
import {
  biomarcadorCorregido,
  corregidaNota,
  crearBffDeCorreccionSimulado,
  errorDatoNoVigente,
  errorFechaFutura,
  errorPermisoDenegado,
  historicoDeBiomarcador,
  historicoDeNota,
  ID_DEL_PACIENTE,
  listaDeNotas,
} from '../support/correccion-ui';
import { fichaDelDoctor } from '../support/ficha-simulado';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { correccion } = mensajes().ficha;
const bff = crearBffDeCorreccionSimulado();
const [her2] = fichaDelDoctor.recentBiomarkers;
if (her2 === undefined) throw new Error('El ejemplo no trae biomarcadores');

function montarTabla(biomarcadores: unknown[] = [her2], egresado = false) {
  render(
    <RecentBiomarkersTable
      biomarcadores={biomarcadores as unknown as Biomarker[]}
      pacienteId={ID_DEL_PACIENTE}
      egresado={egresado}
    />,
  );
  return userEvent.setup();
}

function montarNotas(notas: unknown[] = listaDeNotas.items, egresado = false) {
  render(
    <NotasClinicasDeFicha
      notas={notas as unknown as ClinicalNote[]}
      pacienteId={ID_DEL_PACIENTE}
      egresado={egresado}
    />,
  );
  return userEvent.setup();
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirCorreccion(usuario: Usuario) {
  await usuario.click(screen.getByRole('button', { name: /Corregir dato/ }));
}

describe('Corrección con histórico en la ficha', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-22T12:00:00Z') }));
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    bff.reiniciar();
    refresh.mockReset();
  });

  it('muestra el valor corregido con Corrección manual y el anterior en el histórico desplegable [US-253 AC-1]', async () => {
    bff.historicoDeBiomarcador(historicoDeBiomarcador);
    const usuario = montarTabla([biomarcadorCorregido]);

    const fila = screen.getByRole('row', { name: /Ki-67/ });
    expect(within(fila).getByText(/Corrección manual/)).toBeTruthy();
    expect(within(fila).getByText(/25 %/)).toBeTruthy();
    const alternar = screen.getByRole('button', { name: /Histórico/ });
    expect(alternar.getAttribute('aria-expanded')).toBe('false');

    await usuario.click(alternar);

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    expect(within(historico).getByText(/20 %/)).toBeTruthy();
    expect(within(historico).getByText(/Registro manual/)).toBeTruthy();
    expect(within(historico).getAllByText(correccion.historico.reemplazado).length).toBe(2);
    expect(alternar.getAttribute('aria-expanded')).toBe('true');
  });

  it('muestra la nota nueva y la anterior en el histórico [US-253 AC-2]', async () => {
    bff.historicoDeNota(historicoDeNota);
    const usuario = montarNotas();

    expect(screen.getByText(corregidaNota.content)).toBeTruthy();
    const alternadores = screen.getAllByRole('button', { name: /Histórico/ });
    expect(alternadores).toHaveLength(1);

    await usuario.click(alternadores[0]!);

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    expect(within(historico).getByText('Hipertensión arterial en tratamiento.')).toBeTruthy();
    expect(within(historico).getByText(/Carga inicial/)).toBeTruthy();
  });

  it('muestra el error junto al campo con aria-live assertive y deja el formulario abierto [US-253 AC-3]', async () => {
    bff.corregirBiomarcador(422, errorFechaFutura);
    const usuario = montarTabla();
    await abrirCorreccion(usuario);

    await usuario.type(screen.getByLabelText(correccion.formulario.fecha), '2099-01-01');
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    const mensaje = await screen.findByText(errorFechaFutura.message);
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
    const campo = screen.getByLabelText(correccion.formulario.fecha);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(screen.getByRole('button', { name: correccion.formulario.guardar })).toBeTruthy();
    expect(bff.peticiones[0]?.cuerpo).toEqual({ value: '3+ (IHQ)', performedAt: '2099-01-01' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    [409, errorDatoNoVigente, correccion.errores.noVigente],
    [403, errorPermisoDenegado, correccion.errores.permiso],
  ])(
    'muestra el aviso fijo y deja el formulario abierto cuando el BFF responde %i [US-253 AC-4]',
    async (status, cuerpo, texto) => {
      bff.corregirBiomarcador(status, cuerpo);
      const usuario = montarTabla();
      await abrirCorreccion(usuario);

      await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

      expect(await screen.findByText(texto)).toBeTruthy();
      expect(screen.getByRole('button', { name: correccion.formulario.guardar })).toBeTruthy();
    },
  );

  it('deshabilita Corregir dato con el texto de egresado [US-253 AC-4]', () => {
    montarTabla([her2], true);

    const accion = screen.getByRole('button', { name: /Corregir dato/ }) as HTMLButtonElement;
    expect(accion.disabled).toBe(true);
    expect(screen.getByText(correccion.egresado)).toBeTruthy();
  });

  it('muestra el aviso no bloqueante de análisis anteriores tras guardar [US-253 AC-5]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const usuario = montarTabla();
    await abrirCorreccion(usuario);

    const valor = screen.getByLabelText(correccion.formulario.valor);
    await usuario.clear(valor);
    await usuario.type(valor, '4+');
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    const aviso = await screen.findByText(correccion.avisoAnalisisAnteriores);
    expect(aviso.closest('[role="status"]')).not.toBeNull();
    expect(bff.peticiones[0]).toMatchObject({ metodo: 'POST', cuerpo: { value: '4+' } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: correccion.formulario.guardar })).toBeNull();
    expect(screen.getByRole('button', { name: /Corregir dato/ })).toBeTruthy();
  });

  it('muestra el aviso fijo de nombres sobre el campo de la nota [US-253 AC-6]', async () => {
    const usuario = montarNotas();

    await usuario.click(screen.getAllByRole('button', { name: /Corregir dato/ })[0]!);

    const dialogo = screen.getByRole('dialog');
    const aviso = within(dialogo).getByText(correccion.avisoNombres);
    const campo = within(dialogo).getByLabelText(correccion.formulario.nota);
    expect(aviso.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('devuelve el foco al botón Corregir dato cuando se cierra el diálogo con Escape [US-253 AC-2]', async () => {
    const usuario = montarNotas();
    const accion = screen.getAllByRole('button', { name: /Corregir dato/ })[0]!;
    await usuario.click(accion);

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(accion);
  });

  it('envía el texto y el tipo de la nota y la muestra tras guardar [US-253 AC-2]', async () => {
    bff.corregirNota(201, corregidaNota);
    const usuario = montarNotas();
    await usuario.click(screen.getAllByRole('button', { name: /Corregir dato/ })[0]!);

    const campo = screen.getByLabelText(correccion.formulario.nota);
    await usuario.clear(campo);
    await usuario.type(campo, 'Texto corregido.');
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    expect(await screen.findByText(correccion.avisoAnalisisAnteriores)).toBeTruthy();
    expect(bff.peticiones[0]?.cuerpo).toEqual({
      noteType: 'antecedente',
      content: 'Texto corregido.',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('muestra las fechas del histórico en formato relativo con la fecha absoluta en time [US-253 AC-1]', async () => {
    bff.historicoDeBiomarcador(historicoDeBiomarcador);
    const usuario = montarTabla([biomarcadorCorregido]);

    await usuario.click(screen.getByRole('button', { name: /Histórico/ }));

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    const fecha = within(historico).getAllByText('hace 12 días')[0]!.closest('time');
    expect(fecha?.getAttribute('datetime')).toBe('2026-09-10T00:00:00.000Z');
    expect(fecha?.getAttribute('title')).toBe('10/09/2026');
  });
});
