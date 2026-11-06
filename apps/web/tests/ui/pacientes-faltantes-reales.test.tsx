// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import listadoConChecklist from '../../../../contracts/examples/patient-list-checklist-no-disponible.json';
import PacientesPage from '../../app/(dashboard)/pacientes/page';
import { URL_CLINICAL_API, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import { crearPacientesSimulado } from '../support/pacientes-simulado';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}));

const [conTres, noDisponible] = listadoConChecklist.items;
const sinFaltantes = {
  ...conTres,
  id: 'b1c2d3e4-0000-4000-8000-000000000003',
  missingCriticalCount: 0,
  fullNameMasked: 'P. S. 3.',
};
const tipoNoHabilitado = {
  ...conTres,
  id: 'b1c2d3e4-0000-4000-8000-000000000004',
  cancerTypeEnabled: false,
  missingCriticalCount: 0,
  fullNameMasked: 'P. S. 4.',
};
const pagina = {
  ...listadoConChecklist,
  items: [conTres, noDisponible, sinFaltantes, tipoNoHabilitado],
  total: 4,
};

const clinicalApi = crearPacientesSimulado();

function filaDe(nombre: string): HTMLElement {
  const fila = within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((candidata) => within(candidata).queryByText(nombre) !== null);
  if (fila === undefined) throw new Error(`Sin fila para ${nombre}`);
  return fila;
}

describe('Listado de pacientes · columna Faltantes críticos real (feedback de la Demo 5)', () => {
  beforeAll(() => {
    Object.assign(process.env, {
      CLINICAL_API_URL: URL_CLINICAL_API,
      WEB_ALLOWED_ORIGIN: ORIGEN_PERMITIDO,
      WEB_UPSTREAM_TIMEOUT_MS: '5000',
      WEB_HOME_PATH: '/pacientes',
    });
    clinicalApi.iniciar();
  });
  afterAll(clinicalApi.detener);
  afterEach(() => {
    cleanup();
    clinicalApi.reiniciar();
  });

  it('muestra el número real, un cero honesto, «—» y «No disponible» sin bloquear la ficha [d5fb-02 AC-1]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: pagina });

    render(await PacientesPage({ searchParams: Promise.resolve({}) }));

    expect(within(filaDe('P. S. 1.')).getByText('3 faltantes')).toBeTruthy();
    expect(within(filaDe('P. S. 3.')).getByText('0 faltantes')).toBeTruthy();
    const filaSinCalculo = filaDe('P. S. 4.');
    expect(within(filaSinCalculo).getByText('—')).toBeTruthy();
    expect(within(filaSinCalculo).getByText(/sin cálculo para este tipo de cáncer/i)).toBeTruthy();
    expect(within(filaSinCalculo).queryByText('0 faltantes')).toBeNull();
    const filaDegradada = filaDe('P. S. 2.');
    expect(within(filaDegradada).getByText('No disponible')).toBeTruthy();
    expect(within(filaDegradada).queryByText('0 faltantes')).toBeNull();
    expect(screen.getByRole('link', { name: /P\. S\. 2\./ }).getAttribute('href')).toBe(
      `/pacientes/${noDisponible.id}`,
    );
  });
});
