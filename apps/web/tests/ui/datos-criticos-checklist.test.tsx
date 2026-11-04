// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checklistF_M1,
  checklistTipoNoHabilitado,
  crearBffDeDatosCriticosSimulado,
  montarVistaConDatosCriticos,
} from '../support/datos-criticos-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const bff = crearBffDeDatosCriticosSimulado();
const columna = async () => within(await screen.findByRole('region', { name: 'Datos críticos' }));

describe('Columna «Datos críticos» de la vista de caso', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra 12 filas con etiqueta y estado en texto, 6 Faltante, la versión del catálogo y la nota de que no bloquean [US-004 AC-1]', async () => {
    montarVistaConDatosCriticos();

    const datos = await columna();
    const filas = datos.getAllByRole('listitem');
    expect(filas).toHaveLength(12);
    expect(filas[0]!.textContent).toContain('Histología');
    expect(filas[0]!.textContent).toContain('Presente y verificado');
    const faltantes = filas.filter((fila) => /Faltante/.test(fila.textContent ?? ''));
    expect(faltantes.map((fila) => fila.textContent)).toEqual([
      expect.stringContaining('Grado'),
      expect.stringContaining('Receptor de progesterona'),
      expect.stringContaining('HER2 (ISH)'),
      expect.stringContaining('Ki-67'),
      expect.stringContaining('Estado menopáusico'),
      expect.stringContaining('BRCA germinal'),
    ]);
    const encabezado = screen.getByRole('heading', { name: 'Datos críticos' });
    expect(encabezado.id).toBe('datos-criticos');
    expect(encabezado.getAttribute('tabindex')).toBe('-1');
    expect(datos.getByText(/test-1\.0\.0/)).toBeTruthy();
    expect(datos.getByText(/6 faltantes/)).toBeTruthy();
    expect(
      datos.getByText(
        'Los faltantes no bloquean: si continúas, el análisis los trata como «desconocido» y lo deja escrito en la Base del análisis.',
      ),
    ).toBeTruthy();
  });

  it('muestra 0 faltantes y ninguna acción de registro cuando el checklist es el de F-M1 [US-004 AC-1]', async () => {
    bff.responderChecklist(200, checklistF_M1);

    montarVistaConDatosCriticos();

    const datos = await columna();
    expect(datos.getByText(/0 faltantes/)).toBeTruthy();
    expect(datos.queryAllByRole('link')).toHaveLength(0);
    expect(datos.queryAllByRole('button')).toHaveLength(0);
  });

  it('muestra el aviso de alcance y ninguna fila cuando el tipo de cáncer no está habilitado [US-004 AC-1]', async () => {
    bff.responderChecklist(200, checklistTipoNoHabilitado);

    montarVistaConDatosCriticos();

    const datos = await columna();
    expect(
      datos.getByText('Tipo de cáncer fuera del alcance del piloto: sin análisis con IA'),
    ).toBeTruthy();
    expect(datos.queryAllByRole('listitem')).toHaveLength(0);
  });
});
