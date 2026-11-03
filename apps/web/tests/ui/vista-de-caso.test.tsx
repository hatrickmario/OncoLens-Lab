// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { casoPCaso, crearCasoUiSimulado, ID_DEL_CASO, montarVistaDeCaso } from '../support/caso-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearCasoUiSimulado();

const ESPERADO_EN_LA_LINEA = [
  ['Diagnóstico', 'hace 11 meses'],
  ['Tratamiento previo · inicio', 'hace 11 meses'],
  ['Tratamiento previo · inicio', 'hace 11 meses'],
  ['Tratamiento previo · fin', 'hace 10 meses'],
  ['Examen', 'hace 8 meses'],
  ['Examen', 'hace 5 meses'],
  ['Examen', 'hace 2 meses'],
  ['Progresión', 'hace 2 meses'],
  ['Análisis de IA', 'hace 2 meses'],
  ['Resumen del caso', 'hace 1 mes'],
];

describe('VistaDeCaso', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra los 10 eventos fechados de P-CASO en orden con tipo, fecha relativa, origen, confianza y revisión, la toxicidad sin fecha, los tratamientos, los atributos y la serie del PSA en tabla [US-090 AC-1]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    const linea = within(await screen.findByRole('region', { name: 'Línea de tiempo' }));
    const eventos = linea.getAllByRole('listitem');
    expect(eventos).toHaveLength(10);
    ESPERADO_EN_LA_LINEA.forEach(([tipo, fecha], i) => {
      expect(eventos[i]!.textContent).toContain(tipo);
      expect(eventos[i]!.textContent).toContain(fecha);
    });
    expect(eventos[0]!.querySelector('time')!.getAttribute('datetime')).toBe('2025-10-05');
    expect(eventos[0]!.textContent).toContain('Documento');
    expect(eventos[0]!.textContent).toContain('Confianza de extracción: alta');
    expect(eventos[0]!.textContent).toContain('Verificado');

    const sinFecha = within(screen.getByRole('region', { name: 'Sin fecha confiable' }));
    expect(sinFecha.getByText('Toxicidad cutánea grado 2')).toBeTruthy();
    expect(sinFecha.getByText(/Por revisar/)).toBeTruthy();
    expect(linea.queryByText('Toxicidad cutánea grado 2')).toBeNull();

    const tratamientos = within(screen.getByRole('region', { name: 'Tratamientos previos' }));
    expect(tratamientos.getByRole('row', { name: /Leuprorelina/ }).textContent).toContain(
      'En curso',
    );
    expect(tratamientos.getByRole('row', { name: /Bicalutamida/ }).textContent).toContain(
      'No registrado',
    );

    const atributos = within(screen.getByRole('region', { name: 'Atributos clínicos' }));
    expect(atributos.getAllByRole('row')).toHaveLength(3);

    const filas = within(screen.getByRole('table', { name: 'PSA' }))
      .getAllByRole('row')
      .slice(1);
    expect(filas).toHaveLength(3);
    expect(filas[0]!.textContent).toContain('hace 8 meses');
    expect(filas[0]!.textContent).toContain('4,1 ng/mL');
    expect(filas[2]!.textContent).toContain('9,5 ng/mL');
    expect(screen.getByRole('table', { name: 'Testosterona' })).toBeTruthy();
    expect(bff.peticiones).toEqual([`/api/patients/${ID_DEL_CASO}/case`]);
  });
});
