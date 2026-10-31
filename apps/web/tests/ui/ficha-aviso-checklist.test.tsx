// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import FichaPage from '../../app/(dashboard)/pacientes/[id]/page';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import {
  crearFichaSimulada,
  fichaChecklistNoDisponible,
  fichaDelDoctor,
} from '../support/ficha-simulado';

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'oncolens_session=sesion-sintetica-1' })),
}));

const clinicalApi = crearFichaSimulada();
const ENTORNO = {
  CLINICAL_API_URL: URL_CLINICAL_API,
  WEB_ALLOWED_ORIGIN: ORIGEN_PERMITIDO,
  WEB_UPSTREAM_TIMEOUT_MS: '5000',
  WEB_HOME_PATH: '/pacientes',
};
const AVISO = 'No se pudieron verificar los datos críticos';

async function abrirFicha(cuerpo: object) {
  clinicalApi.responder({ status: 200, cuerpo });
  render(await FichaPage({ params: Promise.resolve({ id: (cuerpo as { id: string }).id }) }));
}

describe('FichaPage · aviso del checklist', () => {
  beforeAll(() => {
    Object.assign(process.env, ENTORNO);
    clinicalApi.iniciar();
  });
  afterAll(clinicalApi.detener);
  afterEach(() => {
    cleanup();
    clinicalApi.reiniciar();
  });

  it('muestra «No se pudieron verificar los datos críticos» con role status y ningún contador 0 ni «sin faltantes» cuando completenessAvailable es false [US-003 AC-2] [US-005 AC-5]', async () => {
    await abrirFicha(fichaChecklistNoDisponible);

    const aviso = screen.getByText(AVISO).closest('[role="status"]');
    expect(aviso).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sin faltantes|0 datos críticos/i);
    expect(screen.queryByText(/dato(s)? crítico(s)? faltante/i)).toBeNull();
  });

  it('mantiene las secciones y el enlace al análisis disponibles cuando el checklist no está disponible [US-003 AC-2] [US-005 AC-5]', async () => {
    await abrirFicha(fichaChecklistNoDisponible);

    expect(screen.getByRole('region', { name: 'Identificación' })).toBeTruthy();
    const analizar = screen.getByRole('link', { name: 'Analizar evidencia' });
    expect(analizar.getAttribute('href')).toBe(`/pacientes/${fichaChecklistNoDisponible.id}/analisis`);
  });

  it('no muestra el aviso cuando completenessAvailable está ausente [US-003 AC-2]', async () => {
    await abrirFicha(fichaDelDoctor);

    expect(screen.queryByText(AVISO)).toBeNull();
  });
});
