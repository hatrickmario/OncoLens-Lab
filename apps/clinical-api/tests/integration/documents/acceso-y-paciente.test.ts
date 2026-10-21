import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TRACE_ID_GENERADO } from '../../support/gateway.js';
import {
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 564;
/** UUID válido que ningún test ni el seed crean. */
const PACIENTE_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_acceso', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('paciente de la carga', () => {
  it('responde 404 NO_ENCONTRADO sin escribir en el almacén cuando el paciente no existe [US-076 AC-6]', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${PACIENTE_INEXISTENTE}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      error: 'NO_ENCONTRADO',
      message: expect.any(String),
      traceId: TRACE_ID_GENERADO,
    });
    expect(escenario.entorno.escrituras()).toBe(0);
  });

  it('responde 404 NO_ENCONTRADO sin escribir en el almacén cuando el patientId no es un UUID [US-076 AC-6]', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/patients/no-es-un-uuid/documents')
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

    expect(respuesta.status).toBe(404);
    expect(escenario.entorno.escrituras()).toBe(0);
  });
});
