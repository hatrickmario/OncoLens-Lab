import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearManejadorAnalisis } from '../../lib/server/evidence-analyses';
import {
  crearClinicalApiSimulado,
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
  peticionDeAnalisis,
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
});
