// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  accionesDe,
  crearBffDeDatosCriticosSimulado,
  ID_DEL_CASO,
  montarVistaConDatosCriticos,
} from '../support/datos-criticos-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const bff = crearBffDeDatosCriticosSimulado();
const columna = async () => within(await screen.findByRole('region', { name: 'Datos críticos' }));

/** Las opciones del catálogo ya se leyeron y se aplicaron: sin esto, `queryByRole('dialog')` nulo sería vacuo. */
async function esperarOpcionesDeRegistro() {
  await waitFor(() =>
    expect(bff.rutas.some((r) => r.endsWith('/manual-entry-options'))).toBe(true),
  );
  await new Promise((resolver) => setTimeout(resolver, 50));
}

describe('Columna «Datos críticos» · acciones de los faltantes', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('ofrece Registrar a mano, abre Registrar atributo con Estado menopáusico seleccionado y no ofrece Cargar documento para el estado menopáusico [US-004 AC-2]', async () => {
    const usuario = userEvent.setup();
    montarVistaConDatosCriticos();
    const datos = await columna();
    const fila = datos
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('Estado menopáusico'))!;
    expect(fila.textContent).not.toMatch(/Cargar documento/i);

    await usuario.click(datos.getByRole('button', { name: 'Registrar a mano Estado menopáusico' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Registrar atributo clínico' });
    await waitFor(() =>
      expect((within(dialogo).getByLabelText('Atributo') as HTMLSelectElement).value).toBe(
        'estado_menopausico',
      ),
    );
  });

  it('lleva Ki-67 a ?item=ki67 y Grado a ?item=grado para abrir el formulario de US-111 [US-004 AC-3]', async () => {
    montarVistaConDatosCriticos();
    const datos = await columna();

    const ki67 = datos.getByRole('link', { name: 'Registrar a mano Ki-67' });
    const grado = datos.getByRole('link', { name: 'Completar diagnóstico a mano Grado' });

    expect(ki67.getAttribute('href')).toBe(`/pacientes/${ID_DEL_CASO}/caso?item=ki67`);
    expect(grado.getAttribute('href')).toBe(`/pacientes/${ID_DEL_CASO}?item=grado`);
  });

  it('abre el formulario de biomarcador prellenado con Ki-67 cuando la vista llega con ?item=ki67 [US-004 AC-3]', async () => {
    montarVistaConDatosCriticos('ki67');

    const dialogo = await screen.findByRole('dialog', { name: 'Registrar biomarcador' });

    await waitFor(() =>
      expect((within(dialogo).getByLabelText('Biomarcador') as HTMLInputElement).value).toBe(
        'Ki-67',
      ),
    );
  });

  it('relee el checklist sin recargar al guardar Ki-67 y la fila muestra Presente y verificado con Registro manual [US-004 AC-3]', async () => {
    bff.crearKi67();
    const usuario = userEvent.setup();
    montarVistaConDatosCriticos('ki67');
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar biomarcador' });
    const d = within(dialogo);
    await waitFor(() =>
      expect((d.getByLabelText('Biomarcador') as HTMLInputElement).value).toBe('Ki-67'),
    );
    await usuario.type(d.getByLabelText('Valor'), '20');
    await usuario.type(d.getByLabelText('Unidad (opcional)'), '%');
    await usuario.selectOptions(d.getByLabelText('Tipo de resultado'), 'cuantitativo');
    fireEvent.change(d.getByLabelText('Fecha del examen'), { target: { value: '2026-09-10' } });

    await usuario.click(d.getByRole('button', { name: 'Guardar' }));

    const datos = await columna();
    await waitFor(() => {
      const fila = datos.getByText('Ki-67').closest('li')!;
      expect(fila.textContent).toContain('Presente y verificado');
      expect(fila.textContent).toContain('Registro manual');
    });
    expect(datos.getByText(/5 faltantes/)).toBeTruthy();
    expect(bff.rutas.filter((r) => r.endsWith('/completeness'))).toHaveLength(2);
  });

  it('no ofrece Cargar documento en ninguna fila Faltante y da una sola acción manual a cada una [US-004 AC-3]', async () => {
    montarVistaConDatosCriticos();
    const datos = await columna();

    const faltantes = datos
      .getAllByRole('listitem')
      .filter((fila) => /Faltante/.test(fila.textContent ?? ''));

    expect(faltantes).toHaveLength(6);
    for (const fila of faltantes) {
      expect(accionesDe(fila)).toHaveLength(1);
      expect(fila.textContent).not.toMatch(/Cargar documento/i);
    }
  });

  it('abre Agregar tratamiento previo cuando el ítem de tratamientos previos está Faltante [US-004 AC-3]', async () => {
    const sinTratamientos = {
      catalogVersion: 'test-1.0.0',
      cancerTypeEnabled: true,
      items: [
        {
          item: 'tratamientos_previos',
          label: 'Tratamientos previos',
          status: 'faltante',
          origin: 'regla',
          provenance: null,
          destination: { entity: 'PriorTreatment', field: null },
          condition: null,
        },
      ],
    };
    bff.responderChecklist(200, sinTratamientos);
    const usuario = userEvent.setup();
    montarVistaConDatosCriticos();
    const datos = await columna();

    await usuario.click(datos.getByRole('button', { name: 'Agregar tratamiento previo' }));

    expect(await screen.findByRole('dialog', { name: 'Agregar tratamiento previo' })).toBeTruthy();
  });

  it('no abre ningún formulario cuando ?item no es un ítem del checklist [US-004 AC-3]', async () => {
    montarVistaConDatosCriticos('no_existe');

    await columna();
    await esperarOpcionesDeRegistro();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no abre ningún formulario con ?item=ki67 cuando el paciente está egresado [US-004 AC-3] [RN-17]', async () => {
    montarVistaConDatosCriticos('ki67', true);

    await columna();
    await esperarOpcionesDeRegistro();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no ofrece acciones de registro y explica el motivo cuando el paciente está egresado [US-004 AC-3] [RN-17]', async () => {
    montarVistaConDatosCriticos(undefined, true);

    const datos = await columna();

    expect(datos.getAllByText('Faltante')).toHaveLength(6);
    expect(accionesDe(await screen.findByRole('region', { name: 'Datos críticos' }))).toHaveLength(
      0,
    );
    expect(datos.getByText(/egresado/)).toBeTruthy();
  });
});
