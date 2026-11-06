import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import {
  LEUPRORELINA,
  TRATAMIENTO_AC_T,
  contarTratamientosYAtributos,
  fuenteIndependiente,
  filaDeTratamiento,
  mamaSinRegistros,
  prostataSinRegistros,
  registrarTratamiento,
  vistaDeCaso,
} from '../../support/correcciones-tratamiento-atributo.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9992;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_tratamiento', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

const FEC = { ...TRATAMIENTO_AC_T, regimenName: 'FEC' };
const FARMACO_EXPERIMENTAL = {
  setting: 'otro',
  regimenName: 'Fármaco experimental X',
  ongoing: false,
  endReason: 'desconocido',
} as const;

function corregir(patientId: string, treatmentId: string, cuerpo: unknown) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/prior-treatments/${treatmentId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

function historial(patientId: string, treatmentId: string) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .get(`/platform/patients/${patientId}/prior-treatments/${treatmentId}/history`)
    .set('Cookie', escenario.cookieDoctor);
}

describe('corrección de un tratamiento previo con histórico', () => {
  it('crea una fila nueva manual_correction y deja la anterior reemplazado con su contenido intacto cuando el doctor corrige el esquema [d5fb-05 AC-1]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);

    const respuesta = await corregir(patientId, original, FEC);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      regimenName: 'FEC',
      supersedesId: original,
      lineNumber: 1,
      setting: 'adyuvante',
      startedAt: '2026-03-10',
      endedAt: '2026-07-14',
      ongoing: false,
      endReason: 'completado',
      provenance: {
        entryMethod: 'manual_correction',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        sourceDocumentId: null,
      },
    });
    expect(respuesta.body.id).not.toBe(original);
    expect(await filaDeTratamiento(cliente, original)).toMatchObject({
      regimen_name: 'AC-T',
      review_status: 'reemplazado',
      entry_method: 'manual',
      supersedes_id: null,
      line_number: 1,
      started_at: '2026-03-10',
      ended_at: '2026-07-14',
      end_reason: 'completado',
    });
    expect(await filaDeTratamiento(cliente, respuesta.body.id)).toMatchObject({
      review_status: 'verificado',
      entry_method: 'manual_correction',
      supersedes_id: original,
    });
  });

  it('muestra solo la fila nueva, con su id y supersedesId, en la vista de caso cuando el tratamiento se corrigió [d5fb-05 AC-1] [RN-07]', async () => {
    const { patientId } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);
    const antes = await vistaDeCaso(escenario, patientId);
    const corregido = await corregir(patientId, original, FEC);

    const despues = await vistaDeCaso(escenario, patientId);

    expect(antes.priorTreatments).toEqual([
      expect.objectContaining({ id: original, regimenName: 'AC-T' }),
    ]);
    expect(antes.priorTreatments[0]).not.toHaveProperty('supersedesId');
    expect(despues.priorTreatments).toEqual([
      expect.objectContaining({
        id: corregido.body.id,
        supersedesId: original,
        regimenName: 'FEC',
      }),
    ]);
  });

  it('devuelve el histórico de la más reciente a la más antigua con el esquema anterior cuando el tratamiento se corrigió dos veces [d5fb-05 AC-1]', async () => {
    const { patientId } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);
    const primera = await corregir(patientId, original, FEC);
    const segunda = await corregir(patientId, primera.body.id, {
      ...FEC,
      regimenName: 'TAC',
    });

    const respuesta = await historial(patientId, segunda.body.id);
    const sinCorregir = await historial(patientId, original);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toEqual([
      expect.objectContaining({
        id: primera.body.id,
        regimenName: 'FEC',
        entryMethod: 'manual_correction',
        reviewStatus: 'reemplazado',
      }),
      expect.objectContaining({
        id: original,
        regimenName: 'AC-T',
        entryMethod: 'manual',
        reviewStatus: 'reemplazado',
      }),
    ]);
    expect(sinCorregir.status).toBe(200);
    expect(sinCorregir.body.items).toEqual([]);
  });
});

describe('normalización del esquema corregido (ADR-33, RN-27)', () => {
  it('recalcula el ATC con el catálogo o lo deja no_mapeado sin código cuando cambia el esquema [d5fb-05 AC-2]', async () => {
    const { patientId, cliente } = await prostataSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId, LEUPRORELINA);
    const registrada = await filaDeTratamiento(cliente, original);

    const aSinMapeo = await corregir(patientId, original, {
      ...LEUPRORELINA,
      regimenName: 'Fármaco experimental X',
    });
    const deVuelta = await corregir(patientId, aSinMapeo.body.id, LEUPRORELINA);

    expect(registrada).toMatchObject({ atc_codes: ['L02AE02'], mapping_status: 'mapeado' });
    expect(aSinMapeo.status).toBe(201);
    expect(aSinMapeo.body).toMatchObject({
      regimenName: 'Fármaco experimental X',
      atcCodes: [],
      mappingStatus: 'no_mapeado',
    });
    expect(deVuelta.status).toBe(201);
    expect(deVuelta.body).toMatchObject({ atcCodes: ['L02AE02'], mappingStatus: 'mapeado' });
    expect(await filaDeTratamiento(cliente, original)).toMatchObject({
      atc_codes: ['L02AE02'],
      mapping_status: 'mapeado',
      review_status: 'reemplazado',
    });
  });

  it('ignora los códigos que envíe el cliente y rechaza la propiedad cuando el cuerpo trae atcCodes [d5fb-05 AC-2] [ADR-33]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, { ...FEC, atcCodes: ['L01XX99'] });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });
});

describe('validación de la corrección: nada cambia ante un 422 o un 409', () => {
  it.each([
    ['endReason', { ...TRATAMIENTO_AC_T, regimenName: 'FEC', endReason: undefined }],
    ['endedAt', { ...TRATAMIENTO_AC_T, regimenName: 'FEC', endedAt: '2026-02-01' }],
    ['endedAt', { ...LEUPRORELINA, regimenName: 'FEC', ongoing: true, endedAt: '2026-09-01' }],
  ])(
    'responde 422 CUERPO_INVALIDO con field %s cuando el fin es incoherente y no cambia nada [d5fb-05 AC-3]',
    async (campo, cuerpo) => {
      const { patientId, cliente } = await mamaSinRegistros(escenario);
      const original = await registrarTratamiento(escenario, patientId);
      const antes = await contarTratamientosYAtributos(cliente, patientId);

      const respuesta = await corregir(patientId, original, cuerpo);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: campo });
      expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
      expect((await filaDeTratamiento(cliente, original)).review_status).toBe('verificado');
    },
  );

  it('responde 422 sin field y sin crear filas cuando la corrección no cambia nada [d5fb-05 AC-3] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, TRATAMIENTO_AC_T);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 409 DATO_NO_VIGENTE y no crea filas cuando se corrige una fila ya reemplazada [d5fb-05 AC-3] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);
    await corregir(patientId, original, FEC);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, { ...FEC, regimenName: 'TAC' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('DATO_NO_VIGENTE');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('crea una sola corrección y responde 409 a la otra cuando llegan dos correcciones concurrentes del mismo tratamiento [d5fb-05 AC-3] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId);

    const { app } = montarCorrecciones(escenario.mundo, { fuente: fuenteIndependiente(escenario) });
    const enviar = (cuerpo: object) =>
      clienteVerificado(app)
        .post(`/platform/patients/${patientId}/prior-treatments/${original}/corrections`)
        .set('Cookie', escenario.cookieDoctor)
        .send(cuerpo);

    const [uno, otro] = await Promise.all([enviar(FEC), enviar({ ...FEC, regimenName: 'TAC' })]);

    expect([uno.status, otro.status].sort()).toEqual([201, 409]);
    const { rows } = await cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM clinical.prior_treatment WHERE supersedes_id = $1',
      [original],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('responde 404 sin escribir cuando el tratamiento es de otro paciente [d5fb-05 AC-3]', async () => {
    const propio = await mamaSinRegistros(escenario);
    const ajeno = await mamaSinRegistros(escenario);
    const tratamiento = await registrarTratamiento(escenario, propio.patientId);

    const respuesta = await corregir(ajeno.patientId, tratamiento, FEC);

    expect(respuesta.status).toBe(404);
    expect((await filaDeTratamiento(propio.cliente, tratamiento)).review_status).toBe('verificado');
  });

  it('acepta un tratamiento sin línea ni fechas y deja los opcionales nulos cuando el cuerpo los omite [d5fb-05 AC-1]', async () => {
    const { patientId } = await prostataSinRegistros(escenario);
    const original = await registrarTratamiento(escenario, patientId, LEUPRORELINA);

    const respuesta = await corregir(patientId, original, FARMACO_EXPERIMENTAL);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      lineNumber: null,
      startedAt: null,
      endedAt: null,
      ongoing: false,
      endReason: 'desconocido',
    });
  });
});
