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

const ESPACIO_DE_IDS = 562;
const PACIENTE = idDePaciente('c');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_validaciones', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('validación del archivo cargado', () => {
  it('responde 422 ARCHIVO_NO_PDF sin fila, sin objeto y sin llamadas a rag-orchestrator cuando el archivo no es PDF por magic bytes, con o sin extensión .pdf [US-076 AC-2]', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    for (const [nombre, contenido] of [
      ['informe.docx', fixture('informe.docx')],
      ['falso.pdf', fixture('falso.pdf')],
    ] as const) {
      const respuesta = await clienteVerificado(app)
        .post(`/platform/patients/${PACIENTE}/documents`)
        .set('Cookie', escenario.cookieDoctor)
        .field('documentType', 'examen')
        .attach('file', contenido, nombre);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toEqual({
        error: 'ARCHIVO_NO_PDF',
        message: expect.any(String),
        traceId: TRACE_ID_GENERADO,
      });
    }

    expect(await documentosDelPaciente(escenario.mundo, PACIENTE)).toHaveLength(0);
    expect(escenario.entorno.escrituras()).toBe(0);
    expect(escenario.entorno.objetos().size).toBe(0);
    expect(escenario.entorno.llamadasARag()).toBe(0);
  });
});
