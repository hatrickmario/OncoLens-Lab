// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PacientesPage from '../../app/(dashboard)/pacientes/page';
import { mensajes } from '../../lib/mensajes';
import { URL_CLINICAL_API, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import { crearPacientesSimulado } from '../support/pacientes-simulado';
import {
  errorInterno,
  errorNoAutenticado,
  paginaDeTres,
  paginaVacia,
} from '../support/pacientes-ui';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}));

const { pacientes } = mensajes();
const clinicalApi = crearPacientesSimulado();
const ENTORNO = {
  CLINICAL_API_URL: URL_CLINICAL_API,
  WEB_ALLOWED_ORIGIN: ORIGEN_PERMITIDO,
  WEB_UPSTREAM_TIMEOUT_MS: '5000',
  WEB_HOME_PATH: '/pacientes',
};

async function abrirPagina(consulta: Record<string, string> = {}) {
  render(await PacientesPage({ searchParams: Promise.resolve(consulta) }));
}

describe('PacientesPage', () => {
  beforeAll(() => {
    Object.assign(process.env, ENTORNO);
    clinicalApi.iniciar();
  });
  afterAll(clinicalApi.detener);
  afterEach(() => {
    cleanup();
    clinicalApi.reiniciar();
  });

  it('muestra SINTÉTICO en cada fila y Página 1 de 2 cuando hay tres pacientes en páginas de dos [US-048 AC-1]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaDeTres });

    await abrirPagina();

    expect(screen.getByRole('heading', { level: 1, name: pacientes.titulo })).toBeTruthy();
    const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    for (const fila of filas) {
      expect(within(fila).getByText('SINTÉTICO')).toBeTruthy();
    }
    expect(screen.getByText('P. S. 1.')).toBeTruthy();
    expect(screen.getByText('•••• 01')).toBeTruthy();
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: pacientes.paginacion.siguiente })).toBeTruthy();
    expect(screen.queryByRole('link', { name: pacientes.paginacion.anterior })).toBeNull();
    const enviada = new URL(clinicalApi.peticiones[0]!.url);
    expect(enviada.pathname).toBe('/platform/patients');
  });

  it('declara las columnas con scope y el enlace de cada paciente a su ficha [US-048 AC-1]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaDeTres });

    await abrirPagina();

    for (const columna of screen.getAllByRole('columnheader')) {
      expect(columna.getAttribute('scope')).toBe('col');
    }
    const enlace = screen.getByRole('link', { name: /P\. S\. 1\./ });
    expect(enlace.getAttribute('href')).toBe('/pacientes/8f2b3c4d-9a1e-4b5c-8d6e-7f8091a2b3c4');
  });

  it('reenvía solo los filtros de la URL al listado cuando se abre con estado, origen y página [US-048 AC-4]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaDeTres });

    await abrirPagina({ status: 'activo', dataOrigin: 'sintetico', page: '2' });

    expect(new URL(clinicalApi.peticiones[0]!.url).search).toBe(
      '?status=activo&dataOrigin=sintetico&page=2',
    );
  });

  it('muestra Aún no hay pacientes registrados cuando el listado está vacío sin filtros [US-048 AC-1]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaVacia });

    await abrirPagina();

    expect(screen.getByText(pacientes.listado.vacio)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('muestra Ningún paciente coincide con los filtros cuando el listado filtrado está vacío [US-048 AC-4]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaVacia });

    await abrirPagina({ status: 'egresado' });

    expect(screen.getByText(pacientes.listado.sinCoincidencias)).toBeTruthy();
  });

  it('muestra el error con el código de traza cuando clinical-api responde 500 [US-048 AC-6]', async () => {
    clinicalApi.responderListado({ status: 500, cuerpo: errorInterno });

    await abrirPagina();

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe(
      'No pudimos cargar el listado. Intenta de nuevo. Código de traza req_d4e5f6a7',
    );
  });

  it('muestra el error con el código de traza propio de web cuando clinical-api no responde [US-048 AC-6]', async () => {
    clinicalApi.listadoInalcanzable();

    await abrirPagina();

    expect(screen.getByRole('alert').textContent).toMatch(
      /^No pudimos cargar el listado\. Intenta de nuevo\. Código de traza req_\w+$/,
    );
  });

  it('redirige a /login?motivo=expirada cuando clinical-api responde 401 [US-048 AC-6]', async () => {
    clinicalApi.responderListado({ status: 401, cuerpo: errorNoAutenticado });

    await expect(PacientesPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('/login?motivo=expirada'),
    });
  });

  it('ignora los parámetros que no son filtros cuando la URL trae identidad [US-048 AC-5]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: paginaDeTres });

    await abrirPagina({ nationalId: 'SINT-0000001', name: 'Prueba', status: 'activo' });

    const enviada = new URL(clinicalApi.peticiones[0]!.url).searchParams;
    expect(Object.fromEntries(enviada)).toEqual({ status: 'activo', page: '1' });
  });
});
