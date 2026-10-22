// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import FichaPage, { metadata } from '../../app/(dashboard)/pacientes/[id]/page';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import {
  biomarcadorManualPorRevisar,
  biomarcadorSinVerificar,
  crearFichaSimulada,
  diagnosticoConGradaciones,
  errorInterno,
  errorNoAutenticado,
  errorNoEncontrado,
  fichaAdmin,
  fichaDelDoctor,
  ID_DE_FICHA,
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

async function abrirFicha(id: string = ID_DE_FICHA) {
  render(await FichaPage({ params: Promise.resolve({ id }) }));
}

function fila(nombre: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(nombre) });
}

const conDiagnostico = (diagnosis: object) => ({ ...fichaDelDoctor, diagnosis });

describe('FichaPage', () => {
  beforeAll(() => {
    Object.assign(process.env, ENTORNO);
    clinicalApi.iniciar();
  });
  afterAll(clinicalApi.detener);
  afterEach(() => {
    cleanup();
    clinicalApi.reiniciar();
  });

  it('muestra el nombre, SINTÉTICO y el título Paciente · OncoLens cuando el doctor abre la ficha [US-051 AC-1]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });

    await abrirFicha();

    expect(screen.getByRole('heading', { level: 1, name: 'Prueba Sintética 1' })).toBeTruthy();
    expect(screen.getAllByText('SINTÉTICO').length).toBeGreaterThan(0);
    expect(screen.getByText('SINT-0000001')).toBeTruthy();
    expect(metadata.title).toBe('Paciente · OncoLens');
    expect(clinicalApi.peticiones[0]!.cookie).toBe('oncolens_session=sesion-sintetica-1');
  });

  it('muestra histología y gradación con espécimen y alcance, y No registrado en los campos null [US-051 AC-1]', async () => {
    const sinDatos = {
      ...diagnosticoConGradaciones,
      histology: null,
      performanceScale: null,
      performanceValue: null,
    };
    clinicalApi.responder({ status: 200, cuerpo: conDiagnostico(sinDatos) });

    await abrirFicha();

    expect(within(fila('Histología')).getByText('No registrado')).toBeTruthy();
    expect(within(fila('Estado funcional')).getByText('No registrado')).toBeTruthy();
    const gradacion = fila('Gradación');
    expect(
      within(gradacion).getByText('Prostatectomía · Global: Gleason 4+3=7 · ISUP 3'),
    ).toBeTruthy();
    expect(within(gradacion).getByText('Biopsia · Peor: Gleason 3+4=7 · ISUP 2')).toBeTruthy();
    expect(within(fila('Estadio')).getByText('TNM_8 T2cN0M0')).toBeTruthy();
  });

  it('muestra la gradación de mama sin espécimen cuando no hay uno [US-051 AC-1]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });

    await abrirFicha();

    expect(within(fila('Gradación')).getByText('Nottingham grado 2')).toBeTruthy();
    expect(within(fila('Histología')).getByText('carcinoma ductal infiltrante')).toBeTruthy();
  });

  it('muestra No registrado en el diagnóstico cuando no hay uno vigente [US-051 AC-3]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: { ...fichaDelDoctor, diagnosis: null } });

    await abrirFicha();

    expect(
      within(screen.getByRole('region', { name: 'Diagnóstico vigente' })).getByText(
        'No registrado',
      ),
    ).toBeTruthy();
  });

  it('muestra Paciente no encontrado y Volver a pacientes cuando clinical-api responde 404 [US-051 AC-2]', async () => {
    clinicalApi.responder({ status: 404, cuerpo: errorNoEncontrado });

    await abrirFicha();

    expect(screen.getByRole('heading', { name: 'Paciente no encontrado' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a pacientes' }).getAttribute('href')).toBe(
      '/pacientes',
    );
  });

  it('muestra Paciente no encontrado sin llamar a clinical-api cuando el id no es un UUID [US-051 AC-2]', async () => {
    await abrirFicha('no-es-un-uuid');

    expect(screen.getByRole('heading', { name: 'Paciente no encontrado' })).toBeTruthy();
    expect(clinicalApi.peticiones).toEqual([]);
  });

  it('redirige a /login?motivo=expirada cuando clinical-api responde 401 [US-051 AC-2]', async () => {
    clinicalApi.responder({ status: 401, cuerpo: errorNoAutenticado });

    await expect(FichaPage({ params: Promise.resolve({ id: ID_DE_FICHA }) })).rejects.toMatchObject(
      {
        digest: expect.stringContaining('/login?motivo=expirada'),
      },
    );
  });

  it('muestra el error con el código de traza cuando clinical-api responde 500 [US-051 AC-2]', async () => {
    clinicalApi.responder({ status: 500, cuerpo: errorInterno });

    await abrirFicha();

    expect(screen.getByRole('alert').textContent).toBe(
      'No pudimos cargar la ficha. Intenta de nuevo. Código de traza req_d4e5f6a7',
    );
  });

  it('muestra Carga inicial y Verificado como texto en el diagnóstico, y Registro manual y Por revisar en un dato manual [US-051 AC-5]', async () => {
    const resumen = {
      ...fichaDelDoctor,
      recentBiomarkers: [...fichaDelDoctor.recentBiomarkers, biomarcadorManualPorRevisar],
    };
    clinicalApi.responder({ status: 200, cuerpo: resumen });

    await abrirFicha();

    const diagnostico = within(screen.getByRole('region', { name: 'Diagnóstico vigente' }));
    expect(
      within(diagnostico.getByRole('row', { name: /Origen y revisión/ })).getByText(
        'Carga inicial · Verificado',
      ),
    ).toBeTruthy();
    expect(within(fila('^RE ')).getByText('Registro manual · Por revisar')).toBeTruthy();
    expect(within(fila('HER2')).getByText('Extraído de documento · Sin verificar')).toBeTruthy();
    expect(within(fila('HER2')).getByText('Sin tendencia calculada')).toBeTruthy();
  });

  it('muestra el aviso informativo de pendientes y mantiene Analizar evidencia habilitado [US-051 AC-6]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: { ...fichaDelDoctor, pendingReviewCount: 3 } });

    await abrirFicha();

    const aviso = screen.getByText('3 datos por revisar · no bloquean el análisis');
    expect(aviso.closest('[role="alert"]')).toBeNull();
    expect(aviso.closest('[role="status"]')).not.toBeNull();
    const analizar = screen.getByRole('link', { name: 'Analizar evidencia' });
    expect(analizar.getAttribute('href')).toBe(`/pacientes/${ID_DE_FICHA}/analisis`);
    expect(analizar.getAttribute('aria-disabled')).toBeNull();
  });

  it('muestra 2 datos sin verificar · no bloquean el análisis con dos valores auto_aceptado [US-051 AC-6]', async () => {
    const resumen = {
      ...fichaDelDoctor,
      pendingReviewCount: 0,
      recentBiomarkers: [...fichaDelDoctor.recentBiomarkers, biomarcadorSinVerificar],
    };
    clinicalApi.responder({ status: 200, cuerpo: resumen });

    await abrirFicha();

    expect(screen.getByText('2 datos sin verificar · no bloquean el análisis')).toBeTruthy();
    expect(screen.queryByText(/por revisar · no bloque/)).toBeNull();
  });

  it('no muestra avisos cuando todo está verificado y no hay pendientes [US-051 AC-6]', async () => {
    const verificado = {
      ...fichaDelDoctor,
      pendingReviewCount: 0,
      recentBiomarkers: [],
    };
    clinicalApi.responder({ status: 200, cuerpo: verificado });

    await abrirFicha();

    expect(screen.queryByText(/no bloque/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Analizar evidencia' })).toBeTruthy();
  });

  it('muestra solo el documento enmascarado y ningún dato clínico cuando la vista es la del administrador [US-045 AC-6]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaAdmin });

    await abrirFicha();

    expect(screen.getByText('•••• 01')).toBeTruthy();
    expect(screen.getAllByText('SINTÉTICO').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Diagnóstico vigente' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Biomarcadores recientes' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Analizar evidencia' })).toBeNull();
  });
});
