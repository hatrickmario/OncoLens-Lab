import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  contarFilasDelPaciente,
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarMamaConNottingham1,
  sembrarMamaConKarnofsky80,
  sembrarMamaFM2,
  sembrarProstataConProstatectomiaGlobal,
  sembrarProstataTnm8,
  sembrarSinDiagnostico,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9860;
let escenario: EscenarioDeRegistroManual;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rm_diagnostico', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

function registrar(patientId: string, cuerpo: unknown) {
  const { app } = montarRegistroManual(escenario.mundo);
  return clienteVerificado(app)
    .post(`/platform/patients/${patientId}/diagnoses`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

const GLEASON_4_3 = {
  gradingSystem: 'gleason_isup',
  specimenType: 'biopsia',
  gradeScope: 'peor',
  gleasonPrimaryPattern: 4,
  gleasonSecondaryPattern: 3,
} as const;

interface FilaDeDiagnostico {
  id: string;
  review_status: string;
  is_active: boolean;
  entry_method: string;
  grade: string | null;
  stage_value: string | null;
}

async function diagnosticosDe(patientId: string): Promise<FilaDeDiagnostico[]> {
  const { rows } = await escenario.mundo.cliente.query<FilaDeDiagnostico>(
    `SELECT id, review_status::text, is_active, entry_method::text, grade, stage_value
       FROM clinical.diagnosis WHERE patient_id = $1 ORDER BY created_at, id`,
    [patientId],
  );
  return rows;
}

describe('corrección explícita del diagnóstico vigente', () => {
  it('crea un diagnóstico manual_correction con Nottingham grado 2 y reemplaza el anterior [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const [anterior] = await diagnosticosDe(patientId);

    const respuesta = await registrar(patientId, {
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 },
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      isActive: true,
      cancerType: 'mama',
      stagingSystem: 'TNM_8',
      stageValue: 'IV',
      diagnosedAt: '2026-10-16',
      grade: 'Nottingham grado 2',
      provenance: { entryMethod: 'manual_correction', reviewStatus: 'verificado' },
    });
    expect(respuesta.body.gradings).toHaveLength(1);
    expect(respuesta.body.gradings[0]).toMatchObject({
      gradingSystem: 'nottingham',
      nottinghamGrade: 2,
      isReference: true,
    });
    const filas = await diagnosticosDe(patientId);
    const reemplazado = filas.find((fila) => fila.id === anterior?.id);
    expect(reemplazado).toMatchObject({
      review_status: 'reemplazado',
      is_active: false,
      grade: null,
      stage_value: 'IV',
    });
    expect(filas.filter((fila) => fila.is_active)).toHaveLength(1);
  });

  it('guarda is_active y la procedencia que devuelve el contrato cuando se crea la corrección [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const respuesta = await registrar(patientId, {
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 },
    });

    const { rows } = await escenario.mundo.cliente.query(
      `SELECT is_active, entry_method::text AS entry_method, review_status::text AS review_status,
              extraction_confidence::text AS extraction_confidence
         FROM clinical.diagnosis WHERE id = $1`,
      [respuesta.body.id],
    );
    expect(rows[0]).toEqual({
      is_active: respuesta.body.isActive,
      entry_method: respuesta.body.provenance.entryMethod,
      review_status: respuesta.body.provenance.reviewStatus,
      extraction_confidence: respuesta.body.provenance.extractionConfidence,
    });
  });

  it('rechaza un grade escrito a mano con 422 y no crea ni modifica filas [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await registrar(patientId, { grade: 'Nottingham grado 3' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
    expect((await diagnosticosDe(patientId)).filter((fila) => fila.is_active)).toHaveLength(1);
  });

  it('copia las gradaciones previas y recalcula la de referencia cuando se registra Nottingham grado 2 [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaConNottingham1(escenario.siembra);

    const respuesta = await registrar(patientId, {
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 },
    });

    expect(respuesta.status).toBe(201);
    const gradaciones = respuesta.body.gradings as {
      nottinghamGrade: number;
      isReference: boolean;
      provenance: { entryMethod: string };
    }[];
    expect(gradaciones).toHaveLength(2);
    expect(gradaciones.filter((g) => g.isReference)).toHaveLength(1);
    expect(gradaciones.find((g) => g.isReference)).toMatchObject({
      nottinghamGrade: 2,
      provenance: { entryMethod: 'manual' },
    });
    expect(respuesta.body.grade).toBe('Nottingham grado 2');
  });

  it('rechaza un cuerpo vacío con 422 CUERPO_INVALIDO cuando hay un diagnóstico vigente [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);

    const respuesta = await registrar(patientId, {});

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
  });
});

describe('la corrección valida el diagnóstico resultante, no solo lo enviado (decisión del Gate 2)', () => {
  it('rechaza con VALOR_FUERA_DE_CATALOGO cuando solo cambia la escala y el valor heredado queda fuera de su rango [US-110 AC-5]', async () => {
    const { patientId } = await sembrarMamaConKarnofsky80(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await registrar(patientId, { performanceScale: 'ECOG' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('VALOR_FUERA_DE_CATALOGO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });

  it('rechaza con VALOR_FUERA_DE_CATALOGO cuando solo cambia el tipo de cáncer y la gradación copiada es de otro tipo [US-110 AC-3]', async () => {
    const { patientId } = await sembrarMamaConNottingham1(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await registrar(patientId, { cancerType: 'prostata' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('VALOR_FUERA_DE_CATALOGO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });
});

describe('concurrencia del registro sobre el mismo paciente', () => {
  it('deja un solo diagnóstico activo y encadena la segunda corrección sobre la primera cuando llegan dos peticiones a la vez [US-110 AC-2]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const { app } = montarRegistroManual(escenario.mundo, { conexionesIndependientes: true });
    const enviar = (stageValue: string) =>
      clienteVerificado(app)
        .post(`/platform/patients/${patientId}/diagnoses`)
        .set('Cookie', escenario.cookieDoctor)
        .send({ stageValue });

    const [a, b] = await Promise.all([enviar('IIA'), enviar('IIB')]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const filas = await diagnosticosDe(patientId);
    expect(filas).toHaveLength(3);
    expect(filas.filter((fila) => fila.is_active)).toHaveLength(1);
    expect(filas.filter((fila) => fila.review_status === 'reemplazado')).toHaveLength(2);
  });
});

describe('gradación de próstata (DEC-05)', () => {
  it('deriva Gleason 7 e ISUP 3 de 4+3 y deja TNM sin cambios [US-110 AC-3]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);

    const respuesta = await registrar(patientId, { grading: GLEASON_4_3 });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.gradings).toHaveLength(1);
    expect(respuesta.body.gradings[0]).toMatchObject({
      gleasonScore: 7,
      isupGradeGroup: 3,
      isReference: true,
    });
    expect(respuesta.body).toMatchObject({
      grade: 'Gleason 4+3=7 · ISUP 3',
      stagingSystem: 'TNM_8',
      stageValue: 'T2c',
    });
  });

  it('rechaza score o ISUP incoherentes con GRADACION_INCOHERENTE sin crear filas [US-110 AC-3]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const score = await registrar(patientId, { grading: { ...GLEASON_4_3, gleasonScore: 8 } });
    const isup = await registrar(patientId, {
      grading: {
        ...GLEASON_4_3,
        gleasonPrimaryPattern: 3,
        gleasonSecondaryPattern: 4,
        isupGradeGroup: 3,
      },
    });

    expect(score.status).toBe(422);
    expect(score.body.error).toBe('GRADACION_INCOHERENTE');
    expect(isup.status).toBe(422);
    expect(isup.body.error).toBe('GRADACION_INCOHERENTE');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });

  it('acepta score e ISUP coherentes enviados por el cliente [US-110 AC-3]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);

    const respuesta = await registrar(patientId, {
      grading: { ...GLEASON_4_3, gleasonScore: 7, isupGradeGroup: 3 },
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.gradings[0]).toMatchObject({ gleasonScore: 7, isupGradeGroup: 3 });
  });

  it('mantiene la prostatectomía global como referencia cuando se registra una biopsia 4+4 [US-110 AC-3]', async () => {
    const { patientId } = await sembrarProstataConProstatectomiaGlobal(escenario.siembra);

    const respuesta = await registrar(patientId, {
      grading: { ...GLEASON_4_3, gleasonPrimaryPattern: 4, gleasonSecondaryPattern: 4 },
    });

    expect(respuesta.status).toBe(201);
    const gradaciones = respuesta.body.gradings as {
      specimenType: string;
      isReference: boolean;
    }[];
    expect(gradaciones).toHaveLength(2);
    expect(gradaciones.find((g) => g.isReference)?.specimenType).toBe('prostatectomia');
    expect(respuesta.body.grade).toBe('Gleason 3+4=7 · ISUP 2');
  });

  it('rechaza nottingham en próstata con VALOR_FUERA_DE_CATALOGO sin crear filas [US-110 AC-3]', async () => {
    const { patientId } = await sembrarProstataTnm8(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await registrar(patientId, {
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 2 },
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('VALOR_FUERA_DE_CATALOGO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });
});

describe('valores validados contra el catálogo', () => {
  it('rechaza ECOG 7 y TNM_5 sin crear filas [US-110 AC-5]', async () => {
    const { patientId } = await sembrarMamaFM2(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const ecog = await registrar(patientId, { performanceScale: 'ECOG', performanceValue: 7 });
    const tnm = await registrar(patientId, { stagingSystem: 'TNM_5' });

    expect(ecog.status).toBe(422);
    expect(ecog.body.error).toBe('VALOR_FUERA_DE_CATALOGO');
    expect(tnm.status).toBe(422);
    expect(tnm.body.error).toBe('VALOR_FUERA_DE_CATALOGO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });
});

describe('diagnóstico manual sin uno vigente', () => {
  it('crea el primer diagnóstico manual sin histología cuando el paciente no tiene uno activo [US-110 AC-6]', async () => {
    const { patientId } = await sembrarSinDiagnostico(escenario.siembra);

    const respuesta = await registrar(patientId, {
      cancerType: 'mama',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      diagnosedAt: '2026-05-02',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      isActive: true,
      histology: null,
      grade: null,
      gradings: [],
      cancerType: 'mama',
      icd10Code: 'C50.9',
      provenance: { entryMethod: 'manual', reviewStatus: 'verificado' },
    });
    expect(await diagnosticosDe(patientId)).toHaveLength(1);
  });

  it('rechaza sin vigente y sin campos mínimos con CUERPO_INVALIDO y no crea filas [US-110 AC-6]', async () => {
    const { patientId } = await sembrarSinDiagnostico(escenario.siembra);
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, patientId);

    const respuesta = await registrar(patientId, { histology: 'carcinoma ductal' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, patientId)).toEqual(antes);
  });
});
