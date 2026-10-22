import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TRACE_ID_GENERADO, idDePaciente } from '../../support/gateway.js';
import type { LineaDeLog } from '../../../src/infrastructure/logger.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  instalarFalloDeInsercionDeDocumento,
  quitarFalloDeInsercionDeDocumento,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 567;
const PACIENTE = idDePaciente('a');
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_compensacion', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

const compensacionesFallidas = (lineas: readonly LineaDeLog[]): LineaDeLog[] =>
  lineas.filter(
    (linea) => linea['event'] === 'documents.compensacion' && linea['resultado'] === 'fallida',
  );

describe('compensación de la carga', () => {
  it('borra el objeto recién escrito y responde 500 sin fila cuando el INSERT del documento falla', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    await instalarFalloDeInsercionDeDocumento(escenario.mundo.cliente);

    try {
      const respuesta = await clienteVerificado(app, {
        respuestasAjenasAlContrato: [
          {
            ruta: `/platform/patients/${PACIENTE}/documents`,
            status: 500,
            esquema: '#/components/schemas/ErrorInterno',
          },
        ],
      })
        .post(`/platform/patients/${PACIENTE}/documents`)
        .set('Cookie', escenario.cookieDoctor)
        .field('documentType', 'examen')
        .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

      expect(respuesta.status).toBe(500);
    } finally {
      await quitarFalloDeInsercionDeDocumento(escenario.mundo.cliente);
    }

    expect(escenario.entorno.escrituras()).toBe(1);
    expect(escenario.entorno.objetos().size).toBe(0);
    expect(await documentosDelPaciente(escenario.mundo, PACIENTE)).toHaveLength(0);
  });

  it('responde 409 y registra la compensación fallida sin la clave ni el nombre cuando otra carga gana la carrera y el borrado del objeto también falla', async () => {
    const { app, logger } = montarDocumentos(escenario.mundo);
    const paciente = idDePaciente('b');
    const pdf = fixture('mama-examen.pdf');
    // Otra carga idéntica confirma su fila mientras esta escribe el objeto: el INSERT choca con la UNIQUE.
    escenario.entorno.alEscribir(async () => {
      await escenario.mundo.cliente.query(
        `INSERT INTO clinical.document
           (id, patient_id, document_type, object_storage_key, checksum, original_filename, mime_type,
            ocr_status, attempts, uploaded_by, uploaded_at)
         VALUES ($1, $2, 'examen', $3, $4, 'otra.pdf', 'application/pdf', 'pendiente', 0, $5, now())`,
        [
          escenario.mundo.ids(),
          paciente,
          `${paciente}/ganadora`,
          createHash('sha256').update(pdf).digest('hex'),
          escenario.doctorId,
        ],
      );
    });
    escenario.entorno.caerBorrado();

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${paciente}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', pdf, 'mama-examen.pdf');

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('DOCUMENTO_DUPLICADO');
    expect(compensacionesFallidas(logger.lineas)).toEqual([
      expect.objectContaining({ patientId: paciente, traceId: TRACE_ID_GENERADO }),
    ]);
    expect(logger.texto()).not.toContain('mama-examen');
    expect(logger.texto()).not.toContain(
      `${paciente}/${compensacionesFallidas(logger.lineas)[0]?.['documentId']}`,
    );
  });

  it('registra la compensación fallida y responde 500 cuando el INSERT falla y el borrado del objeto también', async () => {
    const { app, logger } = montarDocumentos(escenario.mundo);
    const paciente = idDePaciente('c');
    await instalarFalloDeInsercionDeDocumento(escenario.mundo.cliente);
    escenario.entorno.caerBorrado();

    try {
      const respuesta = await clienteVerificado(app, {
        respuestasAjenasAlContrato: [
          {
            ruta: `/platform/patients/${paciente}/documents`,
            status: 500,
            esquema: '#/components/schemas/ErrorInterno',
          },
        ],
      })
        .post(`/platform/patients/${paciente}/documents`)
        .set('Cookie', escenario.cookieDoctor)
        .field('documentType', 'examen')
        .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

      expect(respuesta.status).toBe(500);
    } finally {
      await quitarFalloDeInsercionDeDocumento(escenario.mundo.cliente);
    }

    expect(compensacionesFallidas(logger.lineas)).toEqual([
      expect.objectContaining({ patientId: paciente, traceId: TRACE_ID_GENERADO }),
    ]);
  });
});
