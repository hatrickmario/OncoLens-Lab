import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorAnalisis } from '../../lib/server/evidence-analyses';
import {
  crearClinicalApiSimulado,
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
  peticionDeAnalisis,
  URL_CLINICAL_API,
} from '../support/clinical-api-simulado';

const clinicalApi = crearClinicalApiSimulado();

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('POST /api/evidence-analyses', () => {
  it('reenvía el cuerpo y solo la cookie oncolens_session, sin el X-Trace-Id ni el Idempotency-Key del navegador, y devuelve el mismo status y JSON cuando un doctor autenticado pide el análisis [US-060 AC-1]', async () => {
    clinicalApi.responder({
      status: 200,
      cuerpo: ejemplo('con-evidencia-s1.json'),
      cabeceras: { 'Set-Cookie': 'interna=1', 'X-Trace-Id': 'req_9a3f2c1b' },
    });
    const { dependencias } = crearDependenciasDeTest();
    const solicitud = peticionDeAnalisis({
      Origin: ORIGEN_PERMITIDO,
      Cookie: 'otra=x; oncolens_session=sesion-sintetica-1',
      'X-Trace-Id': 'trace-del-navegador',
      'Idempotency-Key': '3f2b8c1e-0d4a-4e6b-9a7c-5b1d2e3f4a5b',
    });

    const respuesta = await crearManejadorAnalisis(dependencias)(solicitud);

    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('evidence-analysis-request.json'));
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
    expect(enviada.cabeceras).not.toHaveProperty('idempotency-key');
    expect(enviada.cabeceras).not.toHaveProperty('origin');
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual(ejemplo('con-evidencia-s1.json'));
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    expect(respuesta.headers.get('x-trace-id')).toBe('req_9a3f2c1b');
  });

  it('responde 403 PERMISO_DENEGADO y registra motivo=origen sin ningún request a clinical-api cuando el Origin es distinto del configurado [US-060 AC-2]', async () => {
    const { dependencias, lineas } = crearDependenciasDeTest();
    const solicitud = peticionDeAnalisis({
      Origin: 'https://otro-origen.test',
      Cookie: 'oncolens_session=sesion-sintetica-1',
    });

    const respuesta = await crearManejadorAnalisis(dependencias)(solicitud);

    expect(respuesta.status).toBe(403);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorPermisoDenegado', cuerpo);
    expect(cuerpo).toMatchObject({ error: 'PERMISO_DENEGADO', traceId: 'req_web00001' });
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: 'evidence_analyses.proxy', status: 403, traceId: 'req_web00001', duracionMs: 0, motivo: 'origen' },
    ]);
    expect(JSON.stringify(lineas)).not.toContain('otro-origen.test');
  });

  it('responde 403 sin ningún request a clinical-api cuando falta la cabecera Origin [US-060 AC-2]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const solicitud = peticionDeAnalisis({ Cookie: 'oncolens_session=sesion-sintetica-1' });

    const respuesta = await crearManejadorAnalisis(dependencias)(solicitud);

    expect(respuesta.status).toBe(403);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorPermisoDenegado', await respuesta.json());
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('devuelve el mismo status, cuerpo y Retry-After cuando clinical-api responde 429 [US-060 AC-4]', async () => {
    clinicalApi.responder({
      status: 429,
      cuerpo: ejemplo('error-cola-inferencia-llena.json'),
      cabeceras: { 'Retry-After': '30' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(429);
    expect(await respuesta.json()).toEqual(ejemplo('error-cola-inferencia-llena.json'));
    expect(respuesta.headers.get('retry-after')).toBe('30');
  });

  it('devuelve el mismo status y cuerpo cuando clinical-api responde 504 [US-060 AC-4]', async () => {
    clinicalApi.responder({ status: 504, cuerpo: ejemplo('error-deadline-vencido.json') });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(504);
    expect(await respuesta.json()).toEqual(ejemplo('error-deadline-vencido.json'));
  });

  it('retransmite el 401 sin Location ni Set-Cookie cuando clinical-api responde NO_AUTENTICADO [US-060 AC-4]', async () => {
    clinicalApi.responder({
      status: 401,
      cuerpo: ejemplo('error-no-autenticado.json'),
      cabeceras: { 'Set-Cookie': 'oncolens_session=; Max-Age=0', Location: 'http://clinical-api.test:3000/login' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual(ejemplo('error-no-autenticado.json'));
    expect(respuesta.headers.get('location')).toBeNull();
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  it('responde 502 ERROR_SERVICIO_IA sin detalles internos cuando clinical-api es inalcanzable [US-060 AC-4]', async () => {
    clinicalApi.fallarConErrorDeRed();
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    const texto = await respuesta.text();
    const cuerpo = JSON.parse(texto);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', cuerpo);
    expect(cuerpo).toMatchObject({ error: 'ERROR_SERVICIO_IA', traceId: 'req_web00001' });
    expect(texto).not.toContain('clinical-api.test');
    expect(lineas).toEqual([
      { event: 'evidence_analyses.proxy', status: 502, traceId: 'req_web00001', duracionMs: 0, motivo: 'clinical_api_inalcanzable' },
    ]);
  });

  it('responde 502 ERROR_SERVICIO_IA cuando clinical-api no responde dentro del timeout configurado [US-060 AC-4]', async () => {
    clinicalApi.noResponder();
    const { dependencias } = crearDependenciasDeTest({
      config: { clinicalApiUrl: URL_CLINICAL_API, allowedOrigin: ORIGEN_PERMITIDO, upstreamTimeoutMs: 50 },
    });

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', await respuesta.json());
  });
});

function peticionAutenticada(): Request {
  return peticionDeAnalisis({ Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=sesion-sintetica-1' });
}
