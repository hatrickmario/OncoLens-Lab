import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import {
  TRATAMIENTO_AC_T,
  contarTratamientosYAtributos,
  filaDeAtributo,
  filaDeTratamiento,
  mamaSinRegistros,
  pasarAEgresado,
  registrarAtributo,
  registrarTratamiento,
} from '../../support/correcciones-tratamiento-atributo.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9994;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_trat_attr_permisos', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

const CUERPO_TRATAMIENTO = { ...TRATAMIENTO_AC_T, regimenName: 'FEC' };
const CUERPO_ATRIBUTO = { value: 'premenopausica', observedAt: '2026-09-02' };

function pedir(verbo: 'get' | 'post', ruta: string, cookie: string, cuerpo?: object) {
  const peticion = clienteVerificado(montarCorrecciones(escenario.mundo).app)[verbo](ruta);
  const conCookie = peticion.set('Cookie', cookie);
  return verbo === 'post' ? conCookie.send(cuerpo ?? {}) : conCookie;
}

const rutas = (patientId: string, tratamiento: string, atributo: string) => ({
  corregirTratamiento: `/platform/patients/${patientId}/prior-treatments/${tratamiento}/corrections`,
  historialTratamiento: `/platform/patients/${patientId}/prior-treatments/${tratamiento}/history`,
  corregirAtributo: `/platform/patients/${patientId}/clinical-attributes/${atributo}/corrections`,
  historialAtributo: `/platform/patients/${patientId}/clinical-attributes/${atributo}/history`,
});

describe('paciente egresado y administrador no corrigen tratamientos ni atributos', () => {
  it('responde 422 PACIENTE_EGRESADO sin escribir cuando el doctor corrige un tratamiento o un atributo de un paciente egresado [d5fb-05 AC-7] [RN-17]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const tratamiento = await registrarTratamiento(escenario, patientId);
    const atributo = await registrarAtributo(escenario, patientId);
    await pasarAEgresado(cliente, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);
    const ruta = rutas(patientId, tratamiento, atributo);

    const deTratamiento = await pedir(
      'post',
      ruta.corregirTratamiento,
      escenario.cookieDoctor,
      CUERPO_TRATAMIENTO,
    );
    const deAtributo = await pedir(
      'post',
      ruta.corregirAtributo,
      escenario.cookieDoctor,
      CUERPO_ATRIBUTO,
    );

    for (const respuesta of [deTratamiento, deAtributo]) {
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
    }
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
  });

  it('responde 403 al administrador en las cuatro operaciones y no crea filas [d5fb-05 AC-7] [PRD §11]', async () => {
    const { patientId, cliente } = await mamaSinRegistros(escenario);
    const tratamiento = await registrarTratamiento(escenario, patientId);
    const atributo = await registrarAtributo(escenario, patientId);
    const antes = await contarTratamientosYAtributos(cliente, patientId);
    const ruta = rutas(patientId, tratamiento, atributo);

    const respuestas = [
      await pedir('post', ruta.corregirTratamiento, escenario.cookieAdmin, CUERPO_TRATAMIENTO),
      await pedir('post', ruta.corregirAtributo, escenario.cookieAdmin, CUERPO_ATRIBUTO),
      await pedir('get', ruta.historialTratamiento, escenario.cookieAdmin),
      await pedir('get', ruta.historialAtributo, escenario.cookieAdmin),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    }
    expect(await contarTratamientosYAtributos(cliente, patientId)).toEqual(antes);
    expect((await filaDeTratamiento(cliente, tratamiento)).review_status).toBe('verificado');
    expect((await filaDeAtributo(cliente, atributo)).review_status).toBe('verificado');
  });

  it('responde 404 en el histórico cuando el dato es de otro paciente o no es un UUID [d5fb-05 AC-7]', async () => {
    const propio = await mamaSinRegistros(escenario);
    const ajeno = await mamaSinRegistros(escenario);
    const tratamiento = await registrarTratamiento(escenario, propio.patientId);
    const atributo = await registrarAtributo(escenario, propio.patientId);
    const deAjeno = rutas(ajeno.patientId, tratamiento, atributo);
    const noEsUuid = rutas(propio.patientId, 'no-es-uuid', 'tampoco');

    const respuestas = [
      await pedir('get', deAjeno.historialTratamiento, escenario.cookieDoctor),
      await pedir('get', deAjeno.historialAtributo, escenario.cookieDoctor),
      await pedir('get', noEsUuid.historialTratamiento, escenario.cookieDoctor),
      await pedir('get', noEsUuid.historialAtributo, escenario.cookieDoctor),
    ];

    for (const respuesta of respuestas) expect(respuesta.status).toBe(404);
  });
});
