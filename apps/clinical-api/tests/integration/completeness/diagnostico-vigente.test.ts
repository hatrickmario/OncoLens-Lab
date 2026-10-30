import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  nuevoPaciente,
  prepararSiembra,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { montarCompletitud, servicioDeCompletitud } from '../../support/completitud-http.js';
import { filaDeDiagnostico, generadorDeIds, insertar } from '../../support/filas-sinteticas.js';
import { servicioDeIdentidad } from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9504;
let escenario: EscenarioDePacientes;
let siembra: ContextoDeSiembra;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('compl_vigente', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(escenario.mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
});
afterAll(() => escenario.cerrar());

/** Dos diagnósticos activos: el de `diagnosed_at` más reciente (próstata) se creó ANTES que el antiguo (mama). */
async function pacienteConDosDiagnosticosActivos(): Promise<string> {
  const paciente = await nuevoPaciente(siembra);
  const filas = [
    { cancer_type: 'mama', diagnosed_at: '2026-01-01', created_at: '2026-10-02T00:00:00.000Z' },
    { cancer_type: 'prostata', diagnosed_at: '2026-06-01', created_at: '2026-10-01T00:00:00.000Z' },
  ];
  for (const fila of filas) {
    await insertar(
      siembra.cliente,
      'clinical.diagnosis',
      filaDeDiagnostico(siembra.ids, paciente.patientId, paciente.episodeId, {
        ...fila,
        histology: 'sintetica',
        staging_system: 'TNM_8',
        stage_value: 'IIA',
        performance_scale: 'ECOG',
        performance_value: 1,
      }),
    );
  }
  await servicioDeIdentidad(siembra.cliente).guardar({
    patientId: paciente.patientId,
    idType: 'cedula_ciudadania',
    issuingCountry: null,
    numeroDeDocumento: ['555', '0190'].join(''),
    nombreCompleto: 'Paciente Sintético Vigente',
  });
  return paciente.patientId;
}

describe('diagnóstico vigente compartido por la ficha y el checklist', () => {
  it('resuelve el mismo diagnóstico en la ficha y en /completeness cuando hay dos activos y el más reciente se creó antes', async () => {
    const patientId = await pacienteConDosDiagnosticosActivos();
    const completitud = servicioDeCompletitud(escenario.mundo, {
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
    });

    const { app: appFicha } = montarPacientes(escenario.mundo, { completitud });
    const ficha = await clienteVerificado(appFicha)
      .get(`/platform/patients/${patientId}`)
      .set('Cookie', escenario.cookieDoctor);
    const { app: appChecklist } = montarCompletitud(escenario.mundo);
    const checklist = await clienteVerificado(appChecklist)
      .get(`/platform/patients/${patientId}/completeness`)
      .set('Cookie', escenario.cookieDoctor);

    expect(ficha.body.diagnosis.cancerType).toBe('prostata');
    expect(checklist.body.items.map((i: { item: string }) => i.item)).toEqual([
      'psa_serie',
      'ecog',
    ]);
  });
});
