import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorSeguimiento } from '../../lib/server/follow-ups';
import {
  crearClinicalApiSimulado,
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
  URL_CLINICAL_API,
} from '../support/clinical-api-simulado';

const ID_ANALISIS = '7f0c2a9e-5b1d-4c3e-8a6f-2d9e4b1c0a35';
const clinicalApi = crearClinicalApiSimulado(
  `${URL_CLINICAL_API}/platform/evidence-analyses/${ID_ANALISIS}/follow-ups`,
);

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

function peticion(cabeceras: Record<string, string>, id = ID_ANALISIS): Request {
  return new Request(`${ORIGEN_PERMITIDO}/api/evidence-analyses/${id}/follow-ups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(ejemplo('follow-up-create.json')),
  });
}

const autenticada = () =>
  peticion({ Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=sesion-sintetica-1' });

describe('POST /api/evidence-analyses/{analysisId}/follow-ups', () => {
  it('retransmite el turno 201 con solo la cookie de sesión cuando el doctor pregunta [US-219 AC-2]', async () => {
    clinicalApi.responder({
      status: 201,
      cuerpo: ejemplo('follow-up-turn.json'),
      cabeceras: { 'X-Trace-Id': 'req_9a3f2c1b', 'Set-Cookie': 'interna=1' },
    });
    const { dependencias } = crearDependenciasDeTest();
    const solicitud = peticion({
      Origin: ORIGEN_PERMITIDO,
      Cookie: 'otra=x; oncolens_session=sesion-sintetica-1',
      'X-Trace-Id': 'trace-del-navegador',
    });

    const respuesta = await crearManejadorSeguimiento(dependencias)(solicitud, ID_ANALISIS);

    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('follow-up-create.json'));
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
    expect(enviada.cabeceras).not.toHaveProperty('origin');
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual(ejemplo('follow-up-turn.json'));
    assertMatchesSpec('clinical-api', '#/components/schemas/FollowUpTurn', cuerpo);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    expect(respuesta.headers.get('x-trace-id')).toBe('req_9a3f2c1b');
  });

  it('retransmite el 409 de límite sin reinterpretar cuando el análisis agotó sus preguntas [US-219 AC-4]', async () => {
    clinicalApi.responder({ status: 409, cuerpo: ejemplo('error-limite-seguimiento.json') });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorSeguimiento(dependencias)(autenticada(), ID_ANALISIS);

    expect(respuesta.status).toBe(409);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual(ejemplo('error-limite-seguimiento.json'));
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorLimiteSeguimiento', cuerpo);
  });

  it('rechaza otro origen sin contactar a clinical-api', async () => {
    const { dependencias, lineas } = crearDependenciasDeTest();
    const solicitud = peticion({
      Origin: 'https://otro-origen.test',
      Cookie: 'oncolens_session=sesion-sintetica-1',
    });

    const respuesta = await crearManejadorSeguimiento(dependencias)(solicitud, ID_ANALISIS);

    expect(respuesta.status).toBe(403);
    assertMatchesSpec(
      'clinical-api',
      '#/components/schemas/ErrorPermisoDenegado',
      await respuesta.json(),
    );
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(JSON.stringify(lineas)).not.toContain('otro-origen.test');
  });

  it('responde 404 propio a un analysisId que no es UUID sin contactar a clinical-api', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const solicitud = peticion(
      { Origin: ORIGEN_PERMITIDO, Cookie: 'oncolens_session=s' },
      'no-es-uuid',
    );

    const respuesta = await crearManejadorSeguimiento(dependencias)(solicitud, 'no-es-uuid');

    expect(respuesta.status).toBe(404);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorNoEncontrado', cuerpo);
    expect(cuerpo).toMatchObject({ error: 'NO_ENCONTRADO', traceId: 'req_web00001' });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 502 propio sin URL interna cuando clinical-api no responde', async () => {
    clinicalApi.fallarConErrorDeRed();
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorSeguimiento(dependencias)(autenticada(), ID_ANALISIS);

    expect(respuesta.status).toBe(502);
    const texto = await respuesta.text();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorServicioIa', JSON.parse(texto));
    expect(texto).not.toContain('clinical-api.test');
  });
});
