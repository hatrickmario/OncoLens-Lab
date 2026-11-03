// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import CasoPage from '../../app/(dashboard)/pacientes/[id]/caso/page';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import {
  crearFichaSimulada,
  errorNoAutenticado,
  fichaAdmin,
  fichaDelDoctor,
  ID_DE_FICHA,
} from '../support/ficha-simulado';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn() }),
}));

const clinicalApi = crearFichaSimulada();
const abrir = (id: string = ID_DE_FICHA) => CasoPage({ params: Promise.resolve({ id }) });

describe('CasoPage', () => {
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

  it('muestra la barra del paciente, y la acción de analizar cuando es el doctor', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });

    render(await abrir());

    expect(screen.getByRole('heading', { level: 1, name: 'Prueba Sintética 1' })).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Analizar la evidencia para este caso' })
        .getAttribute('href'),
    ).toBe(`/pacientes/${ID_DE_FICHA}/analisis`);
  });

  it('redirige a /login?motivo=expirada cuando clinical-api responde 401', async () => {
    clinicalApi.responder({ status: 401, cuerpo: errorNoAutenticado });

    await expect(abrir()).rejects.toMatchObject({
      digest: expect.stringContaining('/login?motivo=expirada'),
    });
  });

  it('vuelve a la ficha cuando el usuario es administrador (sin datos clínicos)', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaAdmin });

    await expect(abrir()).rejects.toMatchObject({
      digest: expect.stringContaining(`/pacientes/${ID_DE_FICHA}`),
    });
  });

  it('muestra Paciente no encontrado sin llamar a clinical-api cuando el id no es UUID', async () => {
    render(await abrir('no-es-un-uuid'));

    expect(screen.getByRole('heading', { name: 'Paciente no encontrado' })).toBeTruthy();
    expect(clinicalApi.peticiones).toEqual([]);
  });
});
