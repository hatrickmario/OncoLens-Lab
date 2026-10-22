import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TRACE_ID_GENERADO, idDePaciente } from '../../support/gateway.js';
import {
  BUCKET_DE_TEST,
  ENDPOINT_DEL_ALMACEN,
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 565;
const PACIENTE = idDePaciente('a');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_almacen', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('almacén de documentos no disponible', () => {
  it('responde 503 ALMACEN_NO_DISPONIBLE sin detalles internos y sin fila cuando clinical-minio no responde [US-076 AC-8]', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    escenario.entorno.caerAlmacen();

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${PACIENTE}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({
      error: 'ALMACEN_NO_DISPONIBLE',
      message: expect.any(String),
      traceId: TRACE_ID_GENERADO,
    });
    const texto = JSON.stringify(respuesta.body);
    for (const interno of [new URL(ENDPOINT_DEL_ALMACEN).hostname, BUCKET_DE_TEST, PACIENTE]) {
      expect(texto).not.toContain(interno);
    }
    expect(await documentosDelPaciente(escenario.mundo, PACIENTE)).toHaveLength(0);
  });
});
