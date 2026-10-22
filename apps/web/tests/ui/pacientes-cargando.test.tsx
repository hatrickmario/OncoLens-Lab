// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CargandoPacientes from '../../app/(dashboard)/pacientes/loading';
import { mensajes } from '../../lib/mensajes';

describe('CargandoPacientes', () => {
  afterEach(cleanup);

  it('marca la región con aria-busy y anuncia Cargando pacientes mientras llega el listado [US-048 AC-1]', () => {
    render(<CargandoPacientes />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.textContent).toContain(mensajes().pacientes.cargando);
  });
});
