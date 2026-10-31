import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorChecklist } from '../../lib/server/completeness';
import { crearDependenciasDeTest, ejemplo, URL_CLINICAL_API } from '../support/clinical-api-simulado';
import {
  crearChecklistSimulado,
  ID_DE_PACIENTE_SINTETICO,
  peticionDelChecklist,
} from '../support/completeness-simulado';

const clinicalApi = crearChecklistSimulado();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

const DETALLE_INTERNO = 'PrismaClientKnownRequestError at /srv/clinical-api/dist/modules/completeness.js:42';

describe('GET /api/patients/{id}/completeness', () => {
  it('reenvía la sesión y retransmite el checklist cuando clinical-api responde 200 [US-005 AC-1]', async () => {
    clinicalApi.responder({
      status: 200,
      cuerpo: ejemplo('completeness-f-m2.json'),
      cabeceras: { 'Set-Cookie': 'interna=1', 'X-Trace-Id': 'req_9a3f2c1b' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE, 'X-Trace-Id': 'trace-del-navegador' }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/CompletenessView', cuerpo);
    expect(cuerpo).toEqual(ejemplo('completeness-f-m2.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(new URL(enviada.url).origin).toBe(URL_CLINICAL_API);
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
  });

  it('retransmite el 404 de clinical-api con su cuerpo cuando el paciente no existe [US-005 AC-1]', async () => {
    const cuerpo404 = { error: 'NO_ENCONTRADO', message: 'Paciente no encontrado.', traceId: 'req_1' };
    clinicalApi.responder({ status: 404, cuerpo: cuerpo404 });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual(cuerpo404);
  });

  it('responde 404 propio sin contactar a clinical-api cuando el id no es un UUID [US-005 AC-1]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE }),
      'no-es-un-uuid',
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({
      error: 'NO_ENCONTRADO',
      message: 'Paciente no encontrado.',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde un 5xx saneado con { error, message, traceId propio } sin pila, detalles internos ni URL de clinical-api cuando clinical-api falla [US-005 AC-5]', async () => {
    clinicalApi.responder({
      status: 500,
      cuerpo: {
        error: 'ERROR_INTERNO',
        message: DETALLE_INTERNO,
        traceId: 'req_interno',
        stack: `Error: boom\n    at ${URL_CLINICAL_API}/x`,
      },
      cabeceras: { 'X-Trace-Id': 'req_interno' },
    });
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBeGreaterThanOrEqual(500);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toEqual({
      error: 'ERROR_INTERNO',
      message: 'No se pudo obtener el checklist del paciente.',
      traceId: 'req_web00001',
    });
    for (const prohibido of ['Prisma', 'stack', 'boom', 'clinical-api', 'req_interno', '/srv']) {
      expect(texto).not.toContain(prohibido);
    }
    expect(respuesta.headers.get('x-trace-id')).toBeNull();
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(lineas)).not.toContain(DETALLE_INTERNO);
  });

  it('responde un 5xx saneado cuando clinical-api no es alcanzable [US-005 AC-5]', async () => {
    clinicalApi.inalcanzable();
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBeGreaterThanOrEqual(500);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toEqual({
      error: 'ERROR_INTERNO',
      message: 'No se pudo obtener el checklist del paciente.',
      traceId: 'req_web00001',
    });
    expect(texto).not.toContain('clinical-api');
  });

  it('responde un 5xx saneado cuando clinical-api no responde a tiempo [US-005 AC-5]', async () => {
    clinicalApi.sinRespuesta();
    const { dependencias } = crearDependenciasDeTest({
      config: { ...crearDependenciasDeTest().dependencias.config, upstreamTimeoutMs: 50 },
    });

    const respuesta = await crearManejadorChecklist(dependencias)(
      peticionDelChecklist({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBeGreaterThanOrEqual(500);
    expect((await respuesta.json()).message).toBe('No se pudo obtener el checklist del paciente.');
  });
});
