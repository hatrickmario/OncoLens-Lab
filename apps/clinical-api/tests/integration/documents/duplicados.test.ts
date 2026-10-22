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

const ESPACIO_DE_IDS = 563;
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_duplicados', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

const subir = (app: ReturnType<typeof montarDocumentos>['app'], patientId: string) =>
  clienteVerificado(app)
    .post(`/platform/patients/${patientId}/documents`)
    .set('Cookie', escenario.cookieDoctor)
    .field('documentType', 'examen')
    .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

describe('documentos duplicados por checksum', () => {
  it('responde 409 DOCUMENTO_DUPLICADO y conserva una sola fila y un solo objeto cuando el mismo PDF se sube dos veces [US-076 AC-4]', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    const paciente = idDePaciente('b');

    const primera = await subir(app, paciente);
    const segunda = await subir(app, paciente);

    expect(primera.status).toBe(202);
    expect(segunda.status).toBe(409);
    expect(segunda.body).toEqual({
      error: 'DOCUMENTO_DUPLICADO',
      message: expect.any(String),
      traceId: TRACE_ID_GENERADO,
    });
    expect(await documentosDelPaciente(escenario.mundo, paciente)).toHaveLength(1);
    expect(escenario.entorno.escrituras()).toBe(1);
    expect(escenario.entorno.objetos().size).toBe(1);
  });

  it('acepta una sola de dos cargas simultáneas del mismo PDF y no deja objetos huérfanos cuando compiten por el checksum', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    const paciente = idDePaciente('d');

    const respuestas = await Promise.all([subir(app, paciente), subir(app, paciente)]);

    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([202, 409]);
    expect(await documentosDelPaciente(escenario.mundo, paciente)).toHaveLength(1);
    const claves = [...escenario.entorno.objetos().keys()].filter((clave) =>
      clave.startsWith(`${paciente}/`),
    );
    expect(claves).toHaveLength(1);
  });

  it('acepta el mismo PDF para otro paciente porque el checksum es único por paciente [US-076 AC-4]', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await subir(app, idDePaciente('e'));

    expect(respuesta.status).toBe(202);
  });
});
