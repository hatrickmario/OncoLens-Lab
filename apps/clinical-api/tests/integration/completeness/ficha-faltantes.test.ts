import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CompletenessService } from '../../../src/modules/completeness/ports.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  nuevoPaciente,
  prepararSiembra,
  sembrarDiagnostico,
  sembrarFM2,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { servicioDeCompletitud } from '../../support/completitud-http.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { servicioDeIdentidad } from '../../support/identidad.js';
import {
  iniciarEscenarioDePacientes,
  montarPacientes,
  type EscenarioDePacientes,
} from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9502;
/** Texto que simula el error de `pg` y que nunca debe llegar a la respuesta ni a los logs. */
const ERROR_DE_PG = 'relation "clinical.diagnosis" does not exist (SINT-error-de-pg)';

let escenario: EscenarioDePacientes;
let siembra: ContextoDeSiembra;

beforeAll(async () => {
  escenario = await iniciarEscenarioDePacientes('compl_ficha', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(escenario.mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
});
afterAll(() => escenario.cerrar());

/** Un paciente sintético de la siembra de FEAT-04 con la identidad cifrada que la ficha del doctor exige. */
async function conIdentidad(patientId: string, indice: number): Promise<string> {
  await servicioDeIdentidad(escenario.mundo.cliente).guardar({
    patientId,
    idType: 'cedula_ciudadania',
    issuingCountry: null,
    numeroDeDocumento: ['555', `01${indice}0`].join(''),
    nombreCompleto: `Paciente Sintético Checklist ${indice}`,
  });
  return patientId;
}

const pedirFicha = (id: string, completitud: CompletenessService) => {
  const { app, logger } = montarPacientes(escenario.mundo, { completitud });
  return {
    logger,
    respuesta: clienteVerificado(app)
      .get(`/platform/patients/${id}`)
      .set('Cookie', escenario.cookieDoctor),
  };
};

const completitudDeTest = () =>
  servicioDeCompletitud(escenario.mundo, { rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0 });

describe('missingCriticalCount de la ficha', () => {
  it('es 6 y no marca completenessAvailable cuando el paciente es F-M2 [US-003 AC-2]', async () => {
    const fm2 = await sembrarFM2(siembra);
    await conIdentidad(fm2.patientId, 1);

    const { respuesta } = pedirFicha(fm2.patientId, completitudDeTest());
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body.missingCriticalCount).toBe(6);
    expect(resultado.body).not.toHaveProperty('completenessAvailable');
  });

  it('es 0 cuando el paciente no tiene diagnóstico activo [US-003 AC-2]', async () => {
    const sinDiagnostico = await nuevoPaciente(siembra);
    await conIdentidad(sinDiagnostico.patientId, 2);

    const { respuesta } = pedirFicha(sinDiagnostico.patientId, completitudDeTest());
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body.missingCriticalCount).toBe(0);
  });

  it('es 0 cuando el tipo del diagnóstico no está habilitado [US-003 AC-2]', async () => {
    const paciente = await nuevoPaciente(siembra);
    await sembrarDiagnostico(paciente, {
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      grade: null,
      stagingSystem: 'TNM_8',
      stageValue: 'IV',
      performanceValue: 1,
    });
    await conIdentidad(paciente.patientId, 3);
    const completitud = servicioDeCompletitud(escenario.mundo, {
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      habilitados: ['prostata'],
    });

    const { respuesta } = pedirFicha(paciente.patientId, completitud);
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body.missingCriticalCount).toBe(0);
  });

  it('responde 200 con missingCriticalCount 0 y completenessAvailable false, sin el error de pg en la respuesta ni en los logs, cuando el cálculo falla [US-003 AC-2]', async () => {
    const fm2 = await sembrarFM2(siembra);
    await conIdentidad(fm2.patientId, 4);
    const fallido: CompletenessService = {
      calcular: () => Promise.reject(new Error(ERROR_DE_PG)),
    };

    const { respuesta, logger } = pedirFicha(fm2.patientId, fallido);
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body.missingCriticalCount).toBe(0);
    expect(resultado.body.completenessAvailable).toBe(false);
    expect(JSON.stringify(resultado.body)).not.toContain('SINT-error-de-pg');
    expect(logger.texto()).not.toContain('SINT-error-de-pg');
    expect(
      logger.lineas.some((linea) => linea.event === 'patients.ficha.checklist_no_disponible'),
    ).toBe(true);
  });
});
