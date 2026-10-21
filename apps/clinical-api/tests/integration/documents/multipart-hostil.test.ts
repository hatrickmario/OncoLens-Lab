import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TRACE_ID_GENERADO, idDePaciente } from '../../support/gateway.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 568;
const PACIENTE = idDePaciente('a');
const OTRO_PACIENTE = idDePaciente('b');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_hostil', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

/** Multipart al que le falta el boundary final: el cuerpo termina a mitad del archivo. */
const MULTIPART_TRUNCADO = Buffer.from(
  '--XB\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF-xyz',
);

describe('multipart hostil', () => {
  it('responde 422 CUERPO_INVALIDO sin fila ni objeto y sigue atendiendo cuando el multipart llega truncado', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${PACIENTE}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .set('Content-Type', 'multipart/form-data; boundary=XB')
      .send(MULTIPART_TRUNCADO);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toEqual({
      error: 'CUERPO_INVALIDO',
      message: expect.any(String),
      traceId: TRACE_ID_GENERADO,
    });
    expect(await documentosDelPaciente(escenario.mundo, PACIENTE)).toHaveLength(0);
    expect(escenario.entorno.escrituras()).toBe(0);
    const siguiente = await clienteVerificado(app)
      .post(`/platform/patients/${OTRO_PACIENTE}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');
    expect(siguiente.status).toBe(202);
  }, 5000);
});
