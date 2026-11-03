// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { casoPCaso, casoVacio, crearCasoUiSimulado, montarVistaDeCaso } from '../support/caso-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearCasoUiSimulado();

async function evento(texto: string, indice = 0): Promise<HTMLElement> {
  const linea = within(await screen.findByRole('region', { name: 'Línea de tiempo' }));
  return linea.getAllByRole('listitem').filter((e) => e.textContent!.includes(texto))[indice]!;
}

describe('VistaDeCaso · procedencia y secciones', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra la progresión con origen Documento sin enlace, botón ni URL de documento [US-090 AC-2] [S5 resp. 11b]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    const progresion = await evento('Progresión');
    expect(progresion.textContent).toContain('Documento');
    expect(within(progresion).queryAllByRole('link')).toHaveLength(0);
    expect(within(progresion).queryAllByRole('button')).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain('00001cf2-0000-4000-8000-000000000003');
    expect(screen.queryByText(/Ver documento/)).toBeNull();
  });

  it('lleva Registro manual en Bicalutamida y no ofrece Ver documento [US-090 AC-3]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    expect((await evento('Bicalutamida')).textContent).toContain('Registro manual');
    const fila = within(screen.getByRole('region', { name: 'Tratamientos previos' })).getByRole(
      'row',
      { name: /Bicalutamida/ },
    );
    expect(fila.textContent).toContain('Registro manual');
    expect(screen.queryByText(/Ver documento/)).toBeNull();
  });

  it('presenta el análisis y el resumen solo en la línea de tiempo con Generado por IA · Sin verificar, sin confianza y sin Registro manual [US-090 AC-1] [RN-24] [S5 resp. 11a]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    for (const tipo of ['Análisis de IA', 'Resumen del caso']) {
      const fila = await evento(tipo);
      expect(fila.textContent).toContain('Generado por IA · Sin verificar');
      expect(fila.textContent).not.toContain('Confianza de extracción');
      expect(fila.textContent).not.toContain('Registro manual');
    }
    const fuera = ['Tratamientos previos', 'Atributos clínicos', 'Sin fecha confiable'];
    for (const nombre of fuera) {
      const region = screen.getByRole('region', { name: nombre });
      expect(region.textContent).not.toContain('Análisis de IA');
      expect(region.textContent).not.toContain('Resumen del caso');
    }
  });

  it('rotula el diagnóstico sembrado con Carga inicial [S5 resp. 11b]', async () => {
    const [diagnostico, ...resto] = casoPCaso.timeline;
    const sembrado = {
      ...diagnostico!,
      provenance: { ...diagnostico!.provenance, entryMethod: 'seed', sourceDocumentId: null },
    };
    bff.responder(200, { ...casoPCaso, timeline: [sembrado, ...resto] });

    montarVistaDeCaso();

    expect((await evento('Diagnóstico')).textContent).toContain('Carga inicial');
  });

  it('muestra Evento clínico sin romper la vista cuando el eventType es desconocido [S5 resp. 13]', async () => {
    const [primero, ...resto] = casoPCaso.timeline;
    bff.responder(200, {
      ...casoPCaso,
      timeline: [{ ...primero!, eventType: 'tipo_nuevo', description: 'Dato nuevo' }, ...resto],
    });

    montarVistaDeCaso();

    expect((await evento('Dato nuevo')).textContent).toContain('Evento clínico');
    expect(screen.getByRole('region', { name: 'Tratamientos previos' })).toBeTruthy();
  });

  it('muestra Sin datos registrados en cada sección cuando el CaseView viene vacío [S5 resp. 13]', async () => {
    bff.responder(200, casoVacio);

    montarVistaDeCaso();

    for (const nombre of [
      'Línea de tiempo',
      'Tratamientos previos',
      'Atributos clínicos',
      'Series de biomarcadores',
    ]) {
      const region = within(await screen.findByRole('region', { name: nombre }));
      expect(region.getByText('Sin datos registrados')).toBeTruthy();
    }
  });

  it('no muestra la sección Sin fecha confiable cuando no hay eventos inciertos [S5 resp. 13]', async () => {
    const fechados = casoPCaso.timeline.filter((e) => e.datePrecision !== 'incierta');
    bff.responder(200, { ...casoPCaso, timeline: fechados });

    montarVistaDeCaso();

    await screen.findByRole('region', { name: 'Línea de tiempo' });
    expect(screen.queryByRole('region', { name: 'Sin fecha confiable' })).toBeNull();
  });

  it('rotula bajo la descripción de los eventos de IA Texto generado por IA, sin verificar y no lo repite en los demás [RN-24]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    for (const tipo of ['Análisis de IA', 'Resumen del caso']) {
      expect((await evento(tipo)).textContent).toContain('Texto generado por IA, sin verificar');
    }
    expect((await evento('Progresión')).textContent).not.toContain('Texto generado por IA');
  });
});
