import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TRACE_ID_GENERADO, crearPacienteSintetico, idDePaciente } from '../../support/gateway.js';
import {
  documentosDelPaciente,
  fixture,
  pdfSinteticoDe,
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

const pacienteNuevo = () => crearPacienteSintetico(escenario.mundo, { conDiagnostico: false });

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

  it('responde 422 CUERPO_INVALIDO sin escribir cuando el multipart trae más campos que los permitidos', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    let peticion = clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen');
    for (let i = 0; i < 10; i += 1) peticion = peticion.field(`relleno${i}`, 'x');

    const respuesta = await peticion.attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(escenario.entorno.escrituras()).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO sin escribir cuando un campo supera el tamaño permitido', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .field('comentario', 'a'.repeat(2000))
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(escenario.entorno.escrituras()).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO sin escribir cuando el multipart trae dos archivos', async () => {
    const { app } = montarDocumentos(escenario.mundo);

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf')
      .attach('file', fixture('mama-examen.pdf'), 'otro.pdf');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(escenario.entorno.escrituras()).toBe(0);
  });
});

describe('límite de tamaño de la carga', () => {
  it('responde 202 cuando el PDF mide exactamente MAX_UPLOAD_MB MiB [US-076 AC-3]', async () => {
    const { app } = montarDocumentos(escenario.mundo, { maxUploadMb: 1 });

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', pdfSinteticoDe(1), 'justo.pdf');

    expect(respuesta.status).toBe(202);
  });

  it('responde 422 ARCHIVO_DEMASIADO_GRANDE cuando el PDF mide un byte más que MAX_UPLOAD_MB MiB [US-076 AC-3]', async () => {
    const { app } = montarDocumentos(escenario.mundo, { maxUploadMb: 1 });
    const unByteDeMas = Buffer.concat([pdfSinteticoDe(1), Buffer.from(' ')]);

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', unByteDeMas, 'pasado.pdf');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(escenario.entorno.escrituras()).toBe(0);
  });

  it('rechaza por Content-Length antes de leer el cuerpo cuando supera el máximo con margen', async () => {
    const { app, logger } = montarDocumentos(escenario.mundo, { maxUploadMb: 1 });

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${await pacienteNuevo()}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', pdfSinteticoDe(2), 'enorme.pdf');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(respuesta.headers['connection']).toBe('close');
    expect(logger.lineas).toContainEqual(
      expect.objectContaining({
        event: 'documents.carga',
        resultado: 'archivo_demasiado_grande',
        deteccion: 'content_length',
      }),
    );
    expect(escenario.entorno.escrituras()).toBe(0);
  });
});

describe('nombre del archivo hostil', () => {
  it('guarda el nombre normalizado sin NUL ni saltos de línea y responde 202 cuando el nombre trae caracteres de control', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    const paciente = await pacienteNuevo();
    const cuerpo = Buffer.concat([
      Buffer.from(
        '--XB\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nexamen\r\n' +
          '--XB\r\nContent-Disposition: form-data; name="file"; filename*=UTF-8\'\'inf%00orme%0D%0A.pdf\r\n' +
          'Content-Type: application/pdf\r\n\r\n',
      ),
      fixture('mama-examen.pdf'),
      Buffer.from('\r\n--XB--\r\n'),
    ]);

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
      .set('Content-Type', 'multipart/form-data; boundary=XB')
      .send(cuerpo);

    expect(respuesta.status).toBe(202);
    expect(respuesta.body.originalFilename).toBe('informe.pdf');
    const [fila] = await documentosDelPaciente(escenario.mundo, paciente);
    expect(fila?.original_filename).toBe('informe.pdf');
  });
});
