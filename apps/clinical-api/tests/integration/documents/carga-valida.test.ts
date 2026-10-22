import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 561;
const PACIENTE_SEMILLA_A = idDePaciente('a');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_carga_valida', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('carga de un PDF válido', () => {
  it('responde 202 en pendiente, guarda la fila con checksum y attempts 0 y el objeto con una clave sin el nombre original cuando se sube un PDF válido [US-076 AC-1]', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    const pdf = fixture('mama-examen.pdf');

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${PACIENTE_SEMILLA_A}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', pdf, 'mama-examen.pdf');

    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toMatchObject({
      patientId: PACIENTE_SEMILLA_A,
      documentType: 'examen',
      ocrStatus: 'pendiente',
    });
    const filas = await documentosDelPaciente(escenario.mundo, PACIENTE_SEMILLA_A);
    expect(filas).toHaveLength(1);
    const fila = filas[0]!;
    expect(fila).toMatchObject({
      id: respuesta.body.id,
      checksum: createHash('sha256').update(pdf).digest('hex'),
      attempts: 0,
      ocr_status: 'pendiente',
      uploaded_by: escenario.doctorId,
    });
    expect(fila.object_storage_key).not.toContain('mama-examen');
    const objeto = escenario.entorno.objetos().get(fila.object_storage_key);
    expect(objeto?.bytes.equals(pdf)).toBe(true);
  });
});
