import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  filaDeBiomarcador,
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  registrarKi67,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { INSTANTE_FIJO, insertar } from '../../support/filas-sinteticas.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9950;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_examen', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function corregir(patientId: string, biomarkerId: string, cuerpo: unknown) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/biomarkers/${biomarkerId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

/** Un segundo biomarcador vigente en el mismo examen que `biomarkerId` (un examen con varios datos). */
async function acompanarEnElExamen(biomarkerId: string): Promise<string> {
  const { examen } = await examenDe(biomarkerId);
  const hermano = await insertar(escenario.mundo.cliente, 'clinical.biomarker', {
    id: escenario.mundo.ids(),
    exam_id: examen,
    name: 'RE',
    original_name: 'RE',
    mapping_status: 'no_mapeado',
    value: 'Positivo',
    reference_range: '',
    result_type: 'cualitativo',
    clinical_significance: 'relevante',
    significance_source: 'documento',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    source_span: '{}',
    created_at: INSTANTE_FIJO,
  });
  return hermano['id'] as string;
}

async function examenDe(biomarkerId: string) {
  const fila = await filaDeBiomarcador(escenario.mundo.cliente, biomarkerId);
  return { examen: fila.exam_id, fila };
}

describe('el examen de una corrección de biomarcador (ADR-50, D3)', () => {
  it('mueve el biomarcador a un Exam manual_correction que reemplaza al anterior si era su único biomarcador vigente [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    const { examen: examenAnterior } = await examenDe(ki67);

    const respuesta = await corregir(paciente.patientId, ki67, {
      value: '25',
      unit: '%',
      performedAt: '2026-09-20',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.performedAt).toBe('2026-09-20');
    const nueva = await filaDeBiomarcador(escenario.mundo.cliente, respuesta.body.id);
    expect(nueva).toMatchObject({
      exam_entry_method: 'manual_correction',
      performed_at: '2026-09-20',
      exam_supersedes_id: examenAnterior,
    });
    expect(nueva.exam_id).not.toBe(examenAnterior);
  });

  it('deja vigente el examen anterior con sus otros biomarcadores cuando el corregido no era el único [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    const hermano = await acompanarEnElExamen(ki67);
    const { examen: examenAnterior } = await examenDe(ki67);

    const respuesta = await corregir(paciente.patientId, ki67, {
      value: '25',
      unit: '%',
      performedAt: '2026-09-20',
    });

    expect(respuesta.status).toBe(201);
    const nueva = await filaDeBiomarcador(escenario.mundo.cliente, respuesta.body.id);
    expect(nueva).toMatchObject({
      exam_entry_method: 'manual_correction',
      exam_supersedes_id: null,
    });
    const conservado = await filaDeBiomarcador(escenario.mundo.cliente, hermano);
    expect(conservado).toMatchObject({
      exam_id: examenAnterior,
      review_status: 'verificado',
    });
  });

  it('conserva la fecha del examen anterior cuando la corrección no envía performedAt [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    const { fila: anterior } = await examenDe(ki67);

    const respuesta = await corregir(paciente.patientId, ki67, { value: '25', unit: '%' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.performedAt).toBe(anterior.performed_at);
  });

  it('reemplaza el examen solo con la segunda corrección cuando dos biomarcadores comparten examen [US-253 AC-1]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const ki67 = await registrarKi67(escenario, paciente.patientId);
    const hermano = await acompanarEnElExamen(ki67);
    const { examen: examenOriginal } = await examenDe(ki67);

    const primera = await corregir(paciente.patientId, ki67, { value: '25', unit: '%' });
    const segunda = await corregir(paciente.patientId, hermano, { value: 'Negativo' });

    expect([primera.status, segunda.status]).toEqual([201, 201]);
    const deLaPrimera = await filaDeBiomarcador(escenario.mundo.cliente, primera.body.id);
    const deLaSegunda = await filaDeBiomarcador(escenario.mundo.cliente, segunda.body.id);
    expect(deLaPrimera.exam_supersedes_id).toBeNull();
    expect(deLaSegunda.exam_supersedes_id).toBe(examenOriginal);
  });
});
