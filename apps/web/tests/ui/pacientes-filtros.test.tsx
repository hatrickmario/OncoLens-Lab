// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FiltrosDePacientes } from '../../components/molecules/filtros-de-pacientes';
import { mensajes } from '../../lib/mensajes';

const { pacientes } = mensajes();

function parametrosDe(nombre: string): URLSearchParams {
  const enlace = screen.getByRole('link', { name: nombre });
  return new URL(enlace.getAttribute('href')!, 'http://web.test').searchParams;
}

describe('FiltrosDePacientes', () => {
  afterEach(cleanup);

  it('cambia solo status, dataOrigin y page en la URL cuando se elige un filtro [US-048 AC-4]', () => {
    render(<FiltrosDePacientes filtros={{ status: 'activo', page: 3 }} textos={pacientes} />);

    const origen = parametrosDe(pacientes.filtroOrigenes.sintetico);
    expect(Object.fromEntries(origen)).toEqual({ status: 'activo', dataOrigin: 'sintetico' });

    const estado = parametrosDe(pacientes.estados.egresado);
    expect(Object.fromEntries(estado)).toEqual({ status: 'egresado' });

    const todos = screen.getAllByRole('link', { name: pacientes.filtros.todos });
    const hrefs = todos.map((enlace) => enlace.getAttribute('href'));
    expect(hrefs).toContain('/pacientes?status=activo');
    expect(hrefs).toContain('/pacientes');
  });

  it('marca con aria-current el filtro vigente y no lo deja solo por color [US-048 AC-4]', () => {
    render(
      <FiltrosDePacientes
        filtros={{ status: 'egresado', dataOrigin: 'sintetico' }}
        textos={pacientes}
      />,
    );

    expect(
      screen.getByRole('link', { name: pacientes.estados.egresado }).getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen
        .getByRole('link', { name: pacientes.filtroOrigenes.sintetico })
        .getAttribute('aria-current'),
    ).toBe('true');
    expect(
      screen.getByRole('link', { name: pacientes.estados.activo }).getAttribute('aria-current'),
    ).toBeNull();
  });
});
