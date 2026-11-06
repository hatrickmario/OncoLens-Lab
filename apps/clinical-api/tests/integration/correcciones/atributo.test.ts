import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import {
  ATRIBUTO_MENOPAUSIA,
  DECLARACION_DE_AUSENCIA,
  TRATAMIENTO_AC_T,
  contarTratamientosYAtributos,
  estadosDeLasDeclaraciones,
  filaDeAtributo,
  mamaSinRegistros,
  registrarAtributo,
  registrarTratamiento,
  vistaDeCaso,
} from '../../support/correcciones-tratamiento-atributo.js';
import { montarRegistroClinico } from '../../support/registro-clinico.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9993;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_atributo', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

const PREMENOPAUSICA = { value: 'premenopausica', observedAt: '2026-09-02' };

function corregir(patientId: string, attributeId: string, cuerpo: unknown) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .post(`/platform/patients/${patientId}/clinical-attributes/${attributeId}/corrections`)
    .set('Cookie', escenario.cookieDoctor)
    .send(cuerpo as object);
}

function historial(patientId: string, attributeId: string) {
  return clienteVerificado(montarCorrecciones(escenario.mundo).app)
    .get(`/platform/patients/${patientId}/clinical-attributes/${attributeId}/history`)
    .set('Cookie', escenario.cookieDoctor);
}

describe('corrección de un atributo clínico con histórico', () => {
  it('crea una fila nueva con la misma clave y deja la anterior reemplazado con su valor intacto cuando el doctor corrige el valor y la fecha [d5fb-05 AC-4] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);

    const respuesta = await corregir(patientId, original, PREMENOPAUSICA);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      key: 'estado_menopausico',
      value: 'premenopausica',
      observedAt: '2026-09-02',
      datePrecision: 'dia',
      supersedesId: original,
      provenance: {
        entryMethod: 'manual_correction',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        sourceDocumentId: null,
      },
    });
    expect(await filaDeAtributo(cliente, original)).toMatchObject({
      attribute_key: 'estado_menopausico',
      value: 'posmenopausica',
      observed_at: '2026-09-01',
      review_status: 'reemplazado',
      entry_method: 'manual',
      supersedes_id: null,
    });
    expect(await filaDeAtributo(cliente, respuesta.body.id)).toMatchObject({
      attribute_key: 'estado_menopausico',
      review_status: 'verificado',
      entry_method: 'manual_correction',
      supersedes_id: original,
    });
  });

  it('lista solo la fila nueva y la expone con id y supersedesId en la lista de atributos y en la vista de caso cuando el atributo se corrigió [d5fb-05 AC-4] [RN-07]', async () => {
    const { patientId } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    const corregido = await corregir(patientId, original, PREMENOPAUSICA);

    const { app } = montarRegistroClinico(escenario.mundo);
    const lista = await clienteVerificado(app)
      .get(`/platform/patients/${patientId}/clinical-attributes`)
      .set('Cookie', escenario.cookieDoctor);
    const caso = await vistaDeCaso(escenario, patientId);

    expect(lista.status).toBe(200);
    expect(lista.body.items).toEqual([
      expect.objectContaining({ id: corregido.body.id, supersedesId: original }),
    ]);
    expect(caso.attributes).toEqual([
      expect.objectContaining({
        id: corregido.body.id,
        supersedesId: original,
        key: 'estado_menopausico',
        value: 'premenopausica',
      }),
    ]);
  });

  it('conserva la fecha anterior cuando el cuerpo omite observedAt y cambia solo el valor [d5fb-05 AC-4]', async () => {
    const { patientId } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);

    const respuesta = await corregir(patientId, original, { value: 'perimenopausica' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      value: 'perimenopausica',
      observedAt: '2026-09-01',
      datePrecision: 'dia',
    });
  });

  it('devuelve el histórico de la más reciente a la más antigua cuando el atributo se corrigió dos veces [d5fb-05 AC-4]', async () => {
    const { patientId } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    const primera = await corregir(patientId, original, PREMENOPAUSICA);
    const segunda = await corregir(patientId, primera.body.id, { value: 'perimenopausica' });

    const respuesta = await historial(patientId, segunda.body.id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toEqual([
      expect.objectContaining({
        id: primera.body.id,
        value: 'premenopausica',
        entryMethod: 'manual_correction',
        reviewStatus: 'reemplazado',
      }),
      expect.objectContaining({
        id: original,
        value: 'posmenopausica',
        entryMethod: 'manual',
        reviewStatus: 'reemplazado',
      }),
    ]);
  });
});

describe('validación de la corrección del atributo: nada cambia ante un 422 o un 409', () => {
  it('responde 422 VALOR_FUERA_DE_CATALOGO con field value y sin repetir el valor cuando no está en la lista del catálogo [d5fb-05 AC-5] [RN-29]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, { value: 'valor-inventado-zzz' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' });
    expect(JSON.stringify(respuesta.body)).not.toContain('valor-inventado-zzz');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
    expect((await filaDeAtributo(cliente, original)).review_status).toBe('verificado');
  });

  it('responde 422 CUERPO_INVALIDO sin field y no cambia nada cuando el cuerpo trae attributeKey porque la clave es inmutable [d5fb-05 AC-5]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, {
      ...PREMENOPAUSICA,
      attributeKey: 'estado_castracion',
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 422 sin field y sin crear filas cuando la corrección no cambia el valor ni la fecha [d5fb-05 AC-5] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const conFecha = await corregir(patientId, original, {
      value: ATRIBUTO_MENOPAUSIA.value,
      observedAt: ATRIBUTO_MENOPAUSIA.observedAt,
    });
    const sinFecha = await corregir(patientId, original, { value: ATRIBUTO_MENOPAUSIA.value });

    for (const respuesta of [conFecha, sinFecha]) {
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
      expect(respuesta.body).not.toHaveProperty('field');
    }
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 409 DATO_NO_VIGENTE y no crea filas cuando se corrige una fila ya reemplazada [d5fb-05 AC-5] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const original = await registrarAtributo(escenario, patientId);
    await corregir(patientId, original, PREMENOPAUSICA);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, original, { value: 'perimenopausica' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('DATO_NO_VIGENTE');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 404 sin escribir cuando el atributo es de otro paciente [d5fb-05 AC-5]', async () => {
    const propio = await mamaSinRegistros(escenario);
    const ajeno = await mamaSinRegistros(escenario);
    const atributo = await registrarAtributo(escenario, propio.patientId);

    const respuesta = await corregir(ajeno.patientId, atributo, PREMENOPAUSICA);

    expect(respuesta.status).toBe(404);
    expect((await filaDeAtributo(propio.cliente, atributo)).review_status).toBe('verificado');
  });
});

describe('la declaración de ausencia y la coherencia D4 (d5fb-04)', () => {
  it('corrige la fecha de la declaración como un atributo más y mantiene cumplido el ítem de tratamientos previos cuando solo cambia observedAt [d5fb-05 AC-6] [RN-08]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const declaracion = await registrarAtributo(escenario, patientId, DECLARACION_DE_AUSENCIA);

    const respuesta = await corregir(patientId, declaracion, {
      value: 'si',
      observedAt: '2026-11-04',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      key: 'sin_tratamiento_previo',
      value: 'si',
      observedAt: '2026-11-04',
      supersedesId: declaracion,
      provenance: { entryMethod: 'manual_correction', reviewStatus: 'verificado' },
    });
    expect(await estadosDeLasDeclaraciones(cliente, patientId)).toEqual([
      'reemplazado',
      'verificado',
    ]);
    const caso = await vistaDeCaso(escenario, patientId);
    expect(caso.completeness).toContainEqual({
      item: 'tratamientos_previos',
      status: 'presente_verificado',
    });
    expect(caso.priorTreatments).toEqual([]);
  });

  it('responde 422 VALOR_FUERA_DE_CATALOGO con field value cuando se intenta cambiar el valor si de la declaración [d5fb-05 AC-6]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const declaracion = await registrarAtributo(escenario, patientId, DECLARACION_DE_AUSENCIA);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, declaracion, { value: 'no' });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' });
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 422 sin field cuando la corrección de la declaración no cambia la fecha [d5fb-05 AC-6]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const declaracion = await registrarAtributo(escenario, patientId, DECLARACION_DE_AUSENCIA);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await corregir(patientId, declaracion, {
      value: 'si',
      observedAt: DECLARACION_DE_AUSENCIA.observedAt,
    });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('no crea ni reemplaza declaraciones cuando se corrige un tratamiento vigente [d5fb-05 AC-6] [D4]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const tratamiento = await registrarTratamiento(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);

    const respuesta = await clienteVerificado(montarCorrecciones(escenario.mundo).app)
      .post(`/platform/patients/${patientId}/prior-treatments/${tratamiento}/corrections`)
      .set('Cookie', escenario.cookieDoctor)
      .send({ ...TRATAMIENTO_AC_T, regimenName: 'FEC' });

    expect(respuesta.status).toBe(201);
    expect(await estadosDeLasDeclaraciones(cliente, patientId)).toEqual([]);
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual({
      tratamientos: antes.tratamientos + 1,
      atributos: antes.atributos,
    });
    const caso = await vistaDeCaso(escenario, patientId);
    expect(caso.priorTreatments).toHaveLength(1);
    expect(caso.completeness).toContainEqual({
      item: 'tratamientos_previos',
      status: 'presente_verificado',
    });
  });
});
