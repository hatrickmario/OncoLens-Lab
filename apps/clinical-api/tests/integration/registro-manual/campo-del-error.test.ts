import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CUERPO_KI67,
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarEgresado,
  sembrarMamaFM2,
  sembrarProstataTnm8,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9982;
let escenario: EscenarioDeRegistroManual;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rm_campo', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function registrar(patientId: string, ruta: 'biomarkers' | 'diagnoses', cuerpo: object) {
  const { app } = montarRegistroManual(escenario.mundo);
  return clienteVerificado(app)
    .post(`/platform/patients/${patientId}/${ruta}`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo);
}

describe('campo del error 422 del registro manual', () => {
  it('responde field = performanceValue con ECOG 7 sin repetir el valor [US-111 AC-4]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const respuesta = await registrar(patientId, 'diagnoses', {
      performanceScale: 'ECOG',
      performanceValue: 7,
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({
      error: 'VALOR_FUERA_DE_CATALOGO',
      field: 'performanceValue',
    });
    expect(Object.values(respuesta.body)).not.toContain(7);
    expect(respuesta.body.message).not.toContain('7');
  });

  it('responde field = grading con Gleason incoherente [US-111 AC-4]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);

    const respuesta = await registrar(patientId, 'diagnoses', {
      grading: {
        gradingSystem: 'gleason_isup',
        specimenType: 'biopsia',
        gradeScope: 'peor',
        gleasonPrimaryPattern: 3,
        gleasonSecondaryPattern: 4,
        gleasonScore: 9,
      },
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'GRADACION_INCOHERENTE', field: 'grading' });
  });

  it('responde PACIENTE_EGRESADO sin field [US-111 AC-4]', async () => {
    const { patientId } = await sembrarEgresado(escenario.siembra);

    const respuesta = await registrar(patientId, 'diagnoses', { histology: 'carcinoma ductal' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
    expect(respuesta.body).not.toHaveProperty('field');
  });

  it('responde field = name con un nombre vacío [US-111 AC-4]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const respuesta = await registrar(patientId, 'biomarkers', { ...CUERPO_KI67, name: '' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'name' });
  });
});
