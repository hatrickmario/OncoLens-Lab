// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  accionesDe,
  crearBffDeDatosCriticosSimulado,
  errorInterno,
  errorNoAutenticado,
  montarVistaConDatosCriticos,
} from '../support/datos-criticos-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const bff = crearBffDeDatosCriticosSimulado();
const columna = async () => within(await screen.findByRole('region', { name: 'Datos críticos' }));

describe('Columna «Datos críticos» · origen, errores y accesibilidad', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra Documento, Registro manual, Corrección manual y Carga inicial en texto, sin enlace, botón ni URL de documento [US-004 AC-4] [S5 resp. 11b]', async () => {
    montarVistaConDatosCriticos();
    const datos = await columna();

    const fila = (etiqueta: string) => datos.getByText(etiqueta).closest('li')!;

    expect(fila('Receptor de estrógeno').textContent).toContain('Documento');
    expect(fila('Tratamientos previos').textContent).toContain('Registro manual');
    expect(fila('HER2 (IHQ)').textContent).toContain('Corrección manual');
    expect(fila('Histología').textContent).toContain('Carga inicial');
    for (const etiqueta of ['Receptor de estrógeno', 'Tratamientos previos', 'HER2 (IHQ)']) {
      expect(accionesDe(fila(etiqueta))).toHaveLength(0);
      expect(fila(etiqueta).innerHTML).not.toMatch(/href=|3b8e5a21|documents?\//);
    }
  });

  it('muestra No se pudo calcular el checklist sin filas ni 0 faltantes y la vista completa cuando el checklist responde 500 [US-004 AC-5]', async () => {
    bff.responderChecklist(500, errorInterno);

    montarVistaConDatosCriticos();

    const datos = await columna();
    expect(datos.getByText('No se pudo calcular el checklist')).toBeTruthy();
    expect(datos.queryAllByRole('listitem')).toHaveLength(0);
    expect(datos.queryByText(/faltantes/)).toBeNull();
    expect(await screen.findByRole('region', { name: 'Línea de tiempo' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tratamientos previos' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Series de biomarcadores' })).toBeTruthy();
  });

  it('lleva a /login?motivo=expirada cuando el checklist responde 401 [US-004 AC-5]', async () => {
    bff.responderChecklist(401, errorNoAutenticado);

    montarVistaConDatosCriticos();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
  });

  it('alcanza las 6 acciones con Tab con nombre accesible con la etiqueta y expone cada estado como texto con el símbolo oculto [US-004 AC-6]', async () => {
    const usuario = userEvent.setup();
    montarVistaConDatosCriticos();
    const datos = await columna();

    const acciones = accionesDe(await screen.findByRole('region', { name: 'Datos críticos' }));
    expect(acciones.map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Completar diagnóstico a mano Grado',
      'Registrar a mano Receptor de progesterona',
      'Registrar a mano HER2 (ISH)',
      'Registrar a mano Ki-67',
      'Registrar a mano Estado menopáusico',
      'Registrar a mano BRCA germinal',
    ]);
    for (const accion of acciones) {
      await usuario.tab();
      expect(document.activeElement).toBe(accion);
    }
    const simbolos = datos
      .getAllByText('Faltante')[0]!
      .closest('li')!
      .querySelectorAll('[aria-hidden="true"]');
    expect(simbolos.length).toBeGreaterThan(0);
    expect(datos.getAllByText('Presente y verificado').length).toBeGreaterThan(0);
  });

  it('da el foco al encabezado Datos críticos cuando se llega con #datos-criticos [US-005 AC-7]', async () => {
    window.history.replaceState(null, '', '/pacientes/p/caso#datos-criticos');
    montarVistaConDatosCriticos();

    const encabezado = await screen.findByRole('heading', { name: 'Datos críticos' });

    await waitFor(() => expect(document.activeElement).toBe(encabezado));
    window.history.replaceState(null, '', '/');
  });
});
