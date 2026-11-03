import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorVistaDeCaso } from '../../lib/server/caso';
import {
  crearDependenciasDeTest,
  ejemplo,
  URL_CLINICAL_API,
} from '../support/clinical-api-simulado';
import {
  crearCasoSimulado,
  ID_DE_PACIENTE_SINTETICO,
  peticionDelCaso,
} from '../support/caso-simulado';

const clinicalApi = crearCasoSimulado();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const MENSAJE_500 = 'No se pudo obtener la vista de caso del paciente.';
const DETALLE_INTERNO =
  'PrismaClientKnownRequestError at /srv/clinical-api/dist/modules/case.js:42';

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('GET /api/patients/{id}/case', () => {
  it('reenvía solo la cookie de sesión y retransmite el CaseView con no-store cuando clinical-api responde 200 [US-090 AC-5]', async () => {
    clinicalApi.responder({
      status: 200,
      cuerpo: ejemplo('case-view-p-caso.json'),
      cabeceras: { 'Set-Cookie': 'interna=1', 'X-Trace-Id': 'req_9a3f2c1b' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorVistaDeCaso(dependencias)(
      peticionDelCaso({ Cookie: COOKIE, 'X-Trace-Id': 'trace-del-navegador' }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/CaseView', cuerpo);
    expect(cuerpo).toEqual(ejemplo('case-view-p-caso.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(new URL(enviada.url).origin).toBe(URL_CLINICAL_API);
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
  });

  it.each([
    [401, { error: 'NO_AUTENTICADO', message: 'Sesión no válida.', traceId: 'req_1' }],
    [403, { error: 'PROHIBIDO', message: 'Acción no permitida.', traceId: 'req_1' }],
    [404, { error: 'NO_ENCONTRADO', message: 'Paciente no encontrado.', traceId: 'req_1' }],
  ])(
    'retransmite el %i con su cuerpo cuando clinical-api lo responde [US-090 AC-6]',
    async (status, cuerpo) => {
      clinicalApi.responder({ status, cuerpo });
      const { dependencias } = crearDependenciasDeTest();

      const respuesta = await crearManejadorVistaDeCaso(dependencias)(
        peticionDelCaso({ Cookie: COOKIE }),
        ID_DE_PACIENTE_SINTETICO,
      );

      expect(respuesta.status).toBe(status);
      expect(await respuesta.json()).toEqual(cuerpo);
    },
  );

  it('responde 404 propio sin llamar a clinical-api cuando el id no es UUID [US-090 AC-5]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorVistaDeCaso(dependencias)(
      peticionDelCaso({ Cookie: COOKIE }),
      'no-es-uuid',
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({
      error: 'NO_ENCONTRADO',
      message: 'Paciente no encontrado.',
      traceId: 'req_web00001',
    });
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 500 ERROR_INTERNO saneado con traceId de web cuando clinical-api responde 5xx [US-090 AC-6]', async () => {
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

    const respuesta = await crearManejadorVistaDeCaso(dependencias)(
      peticionDelCaso({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBe(500);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toEqual({
      error: 'ERROR_INTERNO',
      message: MENSAJE_500,
      traceId: 'req_web00001',
    });
    for (const prohibido of ['Prisma', 'stack', 'boom', 'clinical-api', 'req_interno', '/srv']) {
      expect(texto).not.toContain(prohibido);
    }
    expect(respuesta.headers.get('x-trace-id')).toBeNull();
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(lineas)).not.toContain(DETALLE_INTERNO);
  });

  it('responde el mismo 500 y registra motivo clinical_api_inalcanzable sin id ni contenido cuando clinical-api no responde [US-090 AC-6]', async () => {
    clinicalApi.inalcanzable();
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorVistaDeCaso(dependencias)(
      peticionDelCaso({ Cookie: COOKIE }),
      ID_DE_PACIENTE_SINTETICO,
    );

    expect(respuesta.status).toBe(500);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toEqual({
      error: 'ERROR_INTERNO',
      message: MENSAJE_500,
      traceId: 'req_web00001',
    });
    expect(texto).not.toContain('clinical-api');
    const registro = JSON.stringify(lineas);
    expect(registro).toContain('clinical_api_inalcanzable');
    expect(registro).not.toContain(ID_DE_PACIENTE_SINTETICO);
  });
});
