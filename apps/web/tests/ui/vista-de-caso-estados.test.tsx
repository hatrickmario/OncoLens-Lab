// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  casoPCaso,
  crearCasoUiSimulado,
  errorInterno,
  errorNoAutenticado,
  errorNoEncontrado,
  ID_DEL_CASO,
  montarVistaDeCaso,
} from '../support/caso-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearCasoUiSimulado();
const ERROR_500 = errorInterno;

describe('VistaDeCaso · estados y accesibilidad', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('alcanza las acciones con Tab, expone las secciones como encabezados y la serie como tabla con encabezados de columna [US-090 AC-4]', async () => {
    bff.responder(200, casoPCaso);
    const usuario = userEvent.setup();

    montarVistaDeCaso();

    await screen.findByRole('region', { name: 'Línea de tiempo' });
    for (const nombre of [
      'Línea de tiempo',
      'Sin fecha confiable',
      'Tratamientos previos',
      'Atributos clínicos',
      'Series de biomarcadores',
    ]) {
      expect(screen.getByRole('heading', { name: nombre })).toBeTruthy();
    }
    const psa = screen.getByRole('table', { name: 'PSA' });
    expect(
      within(psa)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Fecha', 'Valor', 'Origen y revisión']);
    await usuario.tab();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('expone el estado Por revisar como texto [US-090 AC-4]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    const linea = within(await screen.findByRole('region', { name: 'Línea de tiempo' }));
    const examen = linea
      .getAllByRole('listitem')
      .filter(
        (e) => e.textContent!.includes('hace 2 meses') && e.textContent!.includes('Examen'),
      )[0]!;
    expect(examen.textContent).toContain('Por revisar');
  });

  it('muestra No se pudo cargar la vista de caso con Reintentar y sin secciones ni el message cuando responde 500 [US-090 AC-6]', async () => {
    bff.responder(500, ERROR_500);

    montarVistaDeCaso();

    expect(await screen.findByText('No se pudo cargar la vista de caso')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.body.textContent).not.toContain(ERROR_500.message);
    expect(document.body.textContent).not.toContain('ERROR_INTERNO');
  });

  it('hace una sola petición nueva y muestra la vista cuando se elige Reintentar [US-090 AC-6]', async () => {
    bff.responder(500, ERROR_500);
    const usuario = userEvent.setup();
    montarVistaDeCaso();
    await screen.findByRole('button', { name: 'Reintentar' });
    bff.responder(200, casoPCaso);

    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('region', { name: 'Línea de tiempo' })).toBeTruthy();
    expect(bff.peticiones).toHaveLength(2);
  });

  it('lleva a /login?motivo=expirada sin mostrar datos cuando responde 401', async () => {
    bff.responder(401, errorNoAutenticado);

    montarVistaDeCaso();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('muestra Paciente no encontrado con Volver a pacientes cuando responde 404', async () => {
    bff.responder(404, errorNoEncontrado);

    montarVistaDeCaso();

    expect(await screen.findByText('Paciente no encontrado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a pacientes' }).getAttribute('href')).toBe(
      '/pacientes',
    );
  });

  it('hace todas las peticiones a /api/* del mismo origen sin identidad ni valores en la URL [US-090 AC-5]', async () => {
    bff.responder(200, casoPCaso);

    montarVistaDeCaso();

    await screen.findByRole('region', { name: 'Línea de tiempo' });
    expect(bff.peticiones).toEqual([`/api/patients/${ID_DEL_CASO}/case`]);
  });
});
