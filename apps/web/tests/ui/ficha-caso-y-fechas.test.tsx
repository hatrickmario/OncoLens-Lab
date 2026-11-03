// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import FichaPage from '../../app/(dashboard)/pacientes/[id]/page';
import { hrefDeVistaDeCaso } from '../../lib/ficha/anclas';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import { crearFichaSimulada, fichaDelDoctor, ID_DE_FICHA } from '../support/ficha-simulado';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));

const clinicalApi = crearFichaSimulada();

async function abrirFicha() {
  render(await FichaPage({ params: Promise.resolve({ id: ID_DE_FICHA }) }));
}

describe('Ficha · enlace a la vista de caso y fechas', () => {
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
    vi.useRealTimers();
  });

  it('ofrece Ver caso clínico hacia /pacientes/{id}/caso en la ficha del doctor [US-090 AC-1]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });

    await abrirFicha();

    expect(screen.getByRole('link', { name: 'Ver caso clínico' }).getAttribute('href')).toBe(
      `/pacientes/${ID_DE_FICHA}/caso`,
    );
    expect(hrefDeVistaDeCaso(ID_DE_FICHA)).toBe(`/pacientes/${ID_DE_FICHA}/caso`);
  });

  it('muestra Documento como origen ocr y fechas relativas con la absoluta en time [S5 resp. 11b] [S5 resp. 11d]', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });

    await abrirFicha();

    const diagnostico = within(screen.getByRole('region', { name: 'Diagnóstico vigente' }));
    const diagnosticado = diagnostico.getByRole('row', { name: /Diagnosticado/ });
    expect(diagnosticado.textContent).toContain('hace 1 mes');
    expect(diagnosticado.querySelector('time')!.getAttribute('datetime')).toBe('2026-09-01');
    expect(diagnosticado.querySelector('time')!.getAttribute('title')).toBe('01/09/2026');
    const biomarcadores = within(screen.getByRole('region', { name: 'Biomarcadores recientes' }));
    expect(biomarcadores.getAllByRole('row')[1]!.textContent).toContain('hace 26 días');
    expect(biomarcadores.getAllByRole('row')[1]!.textContent).toContain('Documento');
    expect(document.body.textContent).not.toContain('Extraído de documento');
  });
});
