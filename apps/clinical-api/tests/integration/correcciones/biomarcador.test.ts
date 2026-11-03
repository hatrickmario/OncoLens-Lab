import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  filaDeBiomarcador,
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  registrarKi67,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { CUERPO_KI67, KI67_DE_TEST } from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9910;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_biomarcador', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function corregir(patientId: string, biomarkerId: string, cuerpo: unknown) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/biomarkers/${biomarkerId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

function historial(patientId: string, biomarkerId: string) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .get(`/platform/patients/${patientId}/biomarkers/${biomarkerId}/history`)
    .set('Cookie', escenario.cookieDoctor);
}

describe('corrección de un biomarcador con histórico', () => {
  it('crea un Ki-67 manual_correction y deja el anterior reemplazado con su valor intacto cuando el doctor lo corrige [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);

    const respuesta = await corregir(paciente.patientId, ki67, { value: '25', unit: '%' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: KI67_DE_TEST.name,
      value: '25',
      unit: '%',
      supersedesId: ki67,
      provenance: {
        entryMethod: 'manual_correction',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
      },
    });
    const anterior = await filaDeBiomarcador(escenario.mundo.cliente, ki67);
    expect(anterior).toMatchObject({ value: '20', unit: '%', review_status: 'reemplazado' });
    const nueva = await filaDeBiomarcador(escenario.mundo.cliente, respuesta.body.id);
    expect(nueva).toMatchObject({ supersedes_id: ki67, review_status: 'verificado' });
  });

  it('devuelve el histórico de la más reciente a la más antigua cuando el Ki-67 se corrigió dos veces [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    const primera = await corregir(paciente.patientId, ki67, { value: '25', unit: '%' });
    const segunda = await corregir(paciente.patientId, primera.body.id, { value: '30', unit: '%' });

    const respuesta = await historial(paciente.patientId, segunda.body.id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toEqual([
      expect.objectContaining({
        id: primera.body.id,
        value: '25',
        entryMethod: 'manual_correction',
        reviewStatus: 'reemplazado',
      }),
      expect.objectContaining({
        id: ki67,
        value: '20',
        entryMethod: 'manual',
        reviewStatus: 'reemplazado',
      }),
    ]);
  });

  it('normaliza el biomarcador corregido con ReconciliationService conservando originalName cuando se corrige un ERBB2 [US-253 AC-1] [RN-27] [ADR-33]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const original = await registrarKi67(escenario, paciente.patientId, {
      ...CUERPO_KI67,
      name: 'ERBB2',
      value: '2+',
      unit: undefined,
      resultType: 'cualitativo',
    });

    const respuesta = await corregir(paciente.patientId, original, { value: '3+' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: 'HER2',
      loincCode: 'LOINC-T-HER2',
      mappingStatus: 'mapeado',
      value: '3+',
    });
    const nueva = await filaDeBiomarcador(escenario.mundo.cliente, respuesta.body.id);
    expect(nueva.original_name).toBe('ERBB2');
  });

  it('responde 409 DATO_NO_VIGENTE y no crea filas cuando se corrige una fila ya reemplazada [US-253 AC-1] [RN-08]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    await corregir(paciente.patientId, ki67, { value: '25', unit: '%' });
    const antes = await escenario.mundo.cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1',
      [paciente.patientId],
    );

    const respuesta = await corregir(paciente.patientId, ki67, { value: '40', unit: '%' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('DATO_NO_VIGENTE');
    const despues = await escenario.mundo.cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1',
      [paciente.patientId],
    );
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
  });
});
