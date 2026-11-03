import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  filaDeNota,
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  sembrarNotasDeFx253a,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9920;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_nota', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

const CORRECCION = {
  noteType: 'antecedente',
  content: 'Hipertensión arterial controlada con tratamiento oral desde hace varios años.',
};

function corregir(patientId: string, noteId: string, cuerpo: unknown) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/clinical-notes/${noteId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

function leer(ruta: string) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .get(ruta)
    .set('Cookie', escenario.cookieDoctor);
}

describe('corrección de una nota clínica con histórico', () => {
  it('crea una nota nueva y deja la anterior reemplazado e inactiva con su texto intacto cuando el doctor cambia texto y tipo [US-253 AC-2]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const { comorbilidadId } = await sembrarNotasDeFx253a(paciente);

    const respuesta = await corregir(paciente.patientId, comorbilidadId, CORRECCION);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      noteType: 'antecedente',
      content: CORRECCION.content,
      supersedesId: comorbilidadId,
      provenance: { entryMethod: 'manual_correction', reviewStatus: 'verificado' },
    });
    const anterior = await filaDeNota(escenario.mundo.cliente, comorbilidadId);
    expect(anterior).toMatchObject({
      content: 'Hipertensión arterial en tratamiento.',
      note_type: 'comorbilidad',
      review_status: 'reemplazado',
      is_active: false,
    });
    const nueva = await filaDeNota(escenario.mundo.cliente, respuesta.body.id);
    expect(nueva).toMatchObject({
      is_active: true,
      entry_method: 'manual_correction',
      recorded_at: anterior.recorded_at,
    });
  });

  it('lista solo las notas vigentes y entrega la anterior en el histórico cuando la nota se corrigió [US-253 AC-2]', async () => {
    const paciente = await pacienteConNotas(escenario);
    const { comorbilidadId, notaLibreId } = await sembrarNotasDeFx253a(paciente);
    const corregida = await corregir(paciente.patientId, comorbilidadId, CORRECCION);

    const lista = await leer(`/platform/patients/${paciente.patientId}/clinical-notes`);
    const historico = await leer(
      `/platform/patients/${paciente.patientId}/clinical-notes/${corregida.body.id}/history`,
    );

    expect(lista.status).toBe(200);
    const ids = (lista.body.items as { id: string }[]).map((nota) => nota.id);
    expect(ids).toContain(corregida.body.id);
    expect(ids).toContain(notaLibreId);
    expect(ids).not.toContain(comorbilidadId);
    expect(historico.status).toBe(200);
    expect(historico.body.items).toEqual([
      expect.objectContaining({
        id: comorbilidadId,
        content: 'Hipertensión arterial en tratamiento.',
        noteType: 'comorbilidad',
        reviewStatus: 'reemplazado',
      }),
    ]);
  });
});
