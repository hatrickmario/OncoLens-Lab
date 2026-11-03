import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CUERPO_KI67,
  KI67_DE_TEST,
  contarFilasDelPaciente,
  iniciarEscenarioDeRegistroManual,
  montarRegistroManual,
  sembrarMamaFM2,
  sembrarSinDiagnostico,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9850;
let escenario: EscenarioDeRegistroManual;
let mamaFM2: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rm_biomarcador', ESPACIO_DE_IDS);
  mamaFM2 = (await sembrarMamaFM2(escenario.siembra)).patientId;
});
afterAll(() => escenario.cerrar());

function registrar(cuerpo: unknown, patientId: string = mamaFM2) {
  const { app } = montarRegistroManual(escenario.mundo);
  return clienteVerificado(app)
    .post(`/platform/patients/${patientId}/biomarkers`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

describe('registro manual de un biomarcador', () => {
  it('registra Ki-67 verificado, mapeado y cierra el faltante ki67 cuando un doctor lo envía sobre F-M2 [US-110 AC-1]', async () => {
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, mamaFM2);

    const respuesta = await registrar(CUERPO_KI67);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: KI67_DE_TEST.name,
      loincCode: KI67_DE_TEST.loincCode,
      mappingStatus: 'mapeado',
      value: '20',
      unit: '%',
      resultType: 'cuantitativo',
      clinicalSignificance: 'relevante',
      significanceSource: 'regla',
      examType: 'registro_manual',
      performedAt: '2026-09-10',
      provenance: {
        entryMethod: 'manual',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
        sourceDocumentId: null,
      },
    });
    const despues = await contarFilasDelPaciente(escenario.mundo.cliente, mamaFM2);
    expect(despues.examenes).toBe(antes.examenes + 1);
    const examen = await escenario.mundo.cliente.query(
      "SELECT 1 FROM clinical.exam WHERE patient_id = $1 AND entry_method = 'manual' AND exam_type = 'registro_manual'",
      [mamaFM2],
    );
    expect(examen.rowCount).toBe(1);
    const completitud = await clienteVerificado(montarRegistroManual(escenario.mundo).app)
      .get(`/platform/patients/${mamaFM2}/completeness`)
      .set('Cookie', escenario.cookieDoctor);
    const ki67 = (completitud.body.items as { item: string; status: string }[]).find(
      (fila) => fila.item === 'ki67',
    );
    expect(ki67?.status).toBe('presente_verificado');
  });

  it('registra Ki-67 mapeado con su LOINC cuando se monta el catálogo real [US-110 AC-1] [RN-27] [DEC-04]', async () => {
    const paciente = (await sembrarMamaFM2(escenario.siembra)).patientId;
    const { app } = montarRegistroManual(escenario.mundo, { rutaDelCatalogo: RUTA_CATALOGO_REAL });

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${paciente}/biomarkers`)
      .set('Cookie', escenario.cookieDoctor)
      .send(CUERPO_KI67);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: 'Ki-67',
      mappingStatus: 'mapeado',
      loincCode: '85330-9',
    });
  });

  it('guarda la significancia, la fuente y el tipo de examen que devuelve el contrato cuando se registra Ki-67 [US-110 AC-1]', async () => {
    const paciente = (await sembrarMamaFM2(escenario.siembra)).patientId;

    const respuesta = await registrar(CUERPO_KI67, paciente);

    const { rows } = await escenario.mundo.cliente.query(
      `SELECT b.clinical_significance::text AS clinical_significance,
              b.significance_source::text AS significance_source, e.exam_type
         FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE b.id = $1`,
      [respuesta.body.id],
    );
    expect(rows[0]).toEqual({
      clinical_significance: respuesta.body.clinicalSignificance,
      significance_source: respuesta.body.significanceSource,
      exam_type: respuesta.body.examType,
    });
  });

  it('deja no_mapeado un término del catálogo cuando el paciente no tiene diagnóstico vigente [US-110 AC-4]', async () => {
    const paciente = (await sembrarSinDiagnostico(escenario.siembra)).patientId;

    const respuesta = await registrar(CUERPO_KI67, paciente);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ mappingStatus: 'no_mapeado', loincCode: null });
  });

  it('guarda el término canónico y el texto original de un sinónimo cuando se registra "ki 67" [US-110 AC-1]', async () => {
    const paciente = (await sembrarMamaFM2(escenario.siembra)).patientId;

    const respuesta = await registrar({ ...CUERPO_KI67, name: 'ki 67' }, paciente);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: 'Ki-67',
      loincCode: 'LOINC-T-KI67',
      mappingStatus: 'mapeado',
    });
    const { rows } = await escenario.mundo.cliente.query<{ original_name: string }>(
      `SELECT b.original_name FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 AND e.exam_type = 'registro_manual'`,
      [paciente],
    );
    expect(rows.map((fila) => fila.original_name)).toEqual(['ki 67']);
  });

  it('deja no_mapeado sin código un marcador desconocido y conserva el texto original [US-110 AC-4]', async () => {
    const paciente = (await sembrarMamaFM2(escenario.siembra)).patientId;

    const respuesta = await registrar(
      {
        name: 'marcador XYZ',
        value: 'positivo',
        resultType: 'cualitativo',
        performedAt: '2026-09-10',
      },
      paciente,
    );

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      name: 'marcador XYZ',
      loincCode: null,
      mappingStatus: 'no_mapeado',
    });
    const { rows } = await escenario.mundo.cliente.query<{ original_name: string }>(
      `SELECT b.original_name FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 AND e.exam_type = 'registro_manual'`,
      [paciente],
    );
    expect(rows.map((fila) => fila.original_name)).toEqual(['marcador XYZ']);
  });

  it('rechaza un biomarcador inválido sin crear Exam ni Biomarker cuando falta performedAt o resultType es "otro" [US-110 AC-5]', async () => {
    const paciente = (await sembrarMamaFM2(escenario.siembra)).patientId;
    const antes = await contarFilasDelPaciente(escenario.mundo.cliente, paciente);
    const sinFecha = { ...CUERPO_KI67, performedAt: undefined };

    const sinFechaRespuesta = await registrar(sinFecha, paciente);
    const tipoInvalido = await registrar({ ...CUERPO_KI67, resultType: 'otro' }, paciente);

    expect(sinFechaRespuesta.status).toBe(422);
    expect(sinFechaRespuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(tipoInvalido.status).toBe(422);
    expect(tipoInvalido.body.error).toBe('CUERPO_INVALIDO');
    expect(await contarFilasDelPaciente(escenario.mundo.cliente, paciente)).toEqual(antes);
  });

  it('responde 404 NO_ENCONTRADO cuando el paciente con formato UUID no existe [US-110 AC-1]', async () => {
    const respuesta = await registrar(CUERPO_KI67, '00000000-0000-4000-8000-00000000dead');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
  });
});
