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
      'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
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
      { event: 'evidence_analyses.proxy', status: 403, traceId: 'req_web00001', motivo: 'origen' },
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
      config: { clinicalApiUrl: URL_CLINICAL_API, allowedOrigin: ORIGEN_PERMITIDO, upstreamTimeoutMs: 50, maxBodyBytes: 32768 },
    });

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', await respuesta.json());
  });
  it('devuelve el mismo cuerpo, sin reserializar, y vacío cuando viene vacío [US-060 AC-4]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const textoCrudo = '{"error":"CUERPO_INVALIDO",  "message":"x","traceId":"req_1","limite":1.0}';
    const cabecerasJson = { 'Content-Type': 'application/json' };

    clinicalApi.responderTexto({ status: 422, texto: textoCrudo, cabeceras: cabecerasJson });
    const conCuerpo = await crearManejadorAnalisis(dependencias)(peticionAutenticada());
    clinicalApi.responderTexto({ status: 401, texto: null });
    const sinCuerpo = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(conCuerpo.status).toBe(422);
    expect(await conCuerpo.text()).toBe(textoCrudo);
    expect(sinCuerpo.status).toBe(401);
    expect(await sinCuerpo.text()).toBe('');
    expect(sinCuerpo.headers.get('content-type')).toBeNull();
  });

  it('responde 502 propio y no un 200 vacío cuando el cuerpo de una respuesta 2xx se corta [US-060 AC-4]', async () => {
    // MSW traga los errores de stream; el corte se simula en el borde del fetch inyectado.
    const fetchConCorte: typeof globalThis.fetch = () => {
      const cuerpo = new ReadableStream<Uint8Array>({
        start: (controlador) => {
          controlador.enqueue(new TextEncoder().encode('{"id":'));
          controlador.error(new Error('conexion cortada'));
        },
      });
      return Promise.resolve(new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    const { dependencias, lineas } = crearDependenciasDeTest({ fetch: fetchConCorte });

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', await respuesta.json());
    expect(lineas).toMatchObject([{ status: 502, motivo: 'cuerpo_cortado' }]);
  });

  it('responde 502 propio sin eco cuando un error no 2xx no es application/json [US-060 AC-4]', async () => {
    clinicalApi.responderTexto({
      status: 500,
      texto: '<html>detalle-interno-del-proxy</html>',
      cabeceras: { 'Content-Type': 'text/html' },
    });
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    expect(lineas).toMatchObject([{ status: 502, motivo: 'error_no_json' }]);
    const texto = await respuesta.text();
    expect(texto).not.toContain('detalle-interno-del-proxy');
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', JSON.parse(texto));
  });

  it('responde 502 propio y registra el X-Trace-Id de clinical-api cuando una 2xx con cuerpo no es application/json [US-060 AC-4]', async () => {
    clinicalApi.responderTexto({
      status: 200,
      texto: 'texto-que-no-es-json',
      cabeceras: { 'Content-Type': 'application/jsonx', 'X-Trace-Id': 'req_upstream1' },
    });
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(502);
    expect(await respuesta.text()).not.toContain('texto-que-no-es-json');
    expect(lineas).toEqual([
      {
        event: 'evidence_analyses.proxy',
        status: 502,
        traceId: 'req_web00001',
        traceIdClinicalApi: 'req_upstream1',
        duracionMs: 0,
        motivo: 'error_no_json',
      },
    ]);
  });

  it('acepta application/json con parámetros de charset en una 2xx [US-060 AC-1]', async () => {
    clinicalApi.responderTexto({
      status: 200,
      texto: '{"ok":true}',
      cabeceras: { 'Content-Type': 'Application/JSON; charset=utf-8' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorAnalisis(dependencias)(peticionAutenticada());

    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe('{"ok":true}');
  });

  it('marca Cache-Control no-store en las respuestas 200, 403, 413 y 502 [US-060 AC-1]', async () => {
    const { dependencias } = crearDependenciasDeTest({
      config: { clinicalApiUrl: URL_CLINICAL_API, allowedOrigin: ORIGEN_PERMITIDO, upstreamTimeoutMs: 5000, maxBodyBytes: 4096 },
    });
    const manejador = crearManejadorAnalisis(dependencias);

    clinicalApi.responder({ status: 200, cuerpo: ejemplo('con-evidencia-s1.json') });
    const ok = await manejador(peticionAutenticada());
    const origenAjeno = await manejador(peticionDeAnalisis({ Origin: 'https://otro-origen.test' }));
    const grande = await manejador(
      peticionDeAnalisis({ Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=s' }, { query: 'x'.repeat(5000) }),
    );
    clinicalApi.fallarConErrorDeRed();
    const caido = await manejador(peticionAutenticada());

    expect([ok.status, origenAjeno.status, grande.status, caido.status]).toEqual([200, 403, 413, 502]);
    for (const respuesta of [ok, origenAjeno, grande, caido]) {
      expect(respuesta.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('responde 413 CUERPO_INVALIDO sin ningún request a clinical-api cuando el cuerpo supera WEB_MAX_BODY_BYTES [US-060 AC-4]', async () => {
    const { dependencias, lineas } = crearDependenciasDeTest({
      config: { clinicalApiUrl: URL_CLINICAL_API, allowedOrigin: ORIGEN_PERMITIDO, upstreamTimeoutMs: 5000, maxBodyBytes: 100 },
    });
    const solicitud = peticionDeAnalisis(
      { Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=sesion-sintetica-1' },
      { query: 'x'.repeat(500) },
    );

    const respuesta = await crearManejadorAnalisis(dependencias)(solicitud);

    expect(respuesta.status).toBe(413);
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorCuerpoInvalido', await respuesta.json());
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: 'evidence_analyses.proxy', status: 413, traceId: 'req_web00001', motivo: 'cuerpo_excesivo' },
    ]);
  });
});

function peticionAutenticada(): Request {
  return peticionDeAnalisis({ Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=sesion-sintetica-1' });
}
