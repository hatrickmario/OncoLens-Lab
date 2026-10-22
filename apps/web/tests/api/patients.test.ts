import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorListadoDePacientes } from '../../lib/server/patients';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
} from '../support/clinical-api-simulado';
import { crearPacientesSimulado, peticionDeListado } from '../support/pacientes-simulado';

const clinicalApi = crearPacientesSimulado();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('GET /api/patients', () => {
  it('reenvía solo los filtros sin identidad y la cookie de sesión, y devuelve la página con Cache-Control: no-store [US-048 AC-1]', async () => {
    clinicalApi.responderListado({
      status: 200,
      cuerpo: ejemplo('patient-page-doctor.json'),
      cabeceras: { 'Set-Cookie': 'interna=1', 'X-Trace-Id': 'req_9a3f2c1b' },
    });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado(
        { Cookie: COOKIE, 'X-Trace-Id': 'trace-del-navegador' },
        '?status=activo&dataOrigin=sintetico&page=2',
      ),
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/PatientPage', cuerpo);
    expect(cuerpo).toEqual(ejemplo('patient-page-doctor.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(new URL(enviada.url).search).toBe('?status=activo&dataOrigin=sintetico&page=2');
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras).not.toHaveProperty('origin');
    expect(JSON.stringify(enviada.cabeceras)).not.toContain('trace-del-navegador');
  });

  it('pide a clinical-api con cache: no-store cuando lee el listado [US-048 AC-5]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: ejemplo('patient-page-doctor.json') });
    const opciones: Array<RequestInit | undefined> = [];
    const { dependencias } = crearDependenciasDeTest({
      fetch: (entrada, init) => {
        opciones.push(init);
        return globalThis.fetch(entrada, init);
      },
    });

    await crearManejadorListadoDePacientes(dependencias)(peticionDeListado({ Cookie: COOKIE }));

    expect(opciones).toHaveLength(1);
    expect(opciones[0]?.cache).toBe('no-store');
  });

  it('responde 422 sin llamar a clinical-api ni repetir el valor cuando la query trae identidad [US-048 AC-5]', async () => {
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado({ Cookie: COOKIE }, '?nationalId=SINT-0000001&name=Prueba'),
    );

    expect(respuesta.status).toBe(422);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorCuerpoInvalido', cuerpo);
    expect(JSON.stringify(cuerpo)).not.toContain('SINT-0000001');
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(JSON.stringify(lineas)).not.toContain('SINT-0000001');
  });

  it('responde 422 sin llamar a clinical-api cuando un filtro está fuera del enum [US-048 AC-4]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado({ Cookie: COOKIE }, '?status=borrado'),
    );

    expect(respuesta.status).toBe(422);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('reexpone el 401 NO_AUTENTICADO tal cual cuando clinical-api dice que la sesión no existe [US-048 AC-6]', async () => {
    clinicalApi.responderListado({ status: 401, cuerpo: ejemplo('error-no-autenticado.json') });
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado({ Cookie: COOKIE }),
    );

    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual(ejemplo('error-no-autenticado.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });

  it('responde 502 propio sin la URL interna cuando clinical-api es inalcanzable [US-048 AC-6]', async () => {
    clinicalApi.listadoInalcanzable();
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado({ Cookie: COOKIE }),
    );

    expect(respuesta.status).toBe(502);
    const texto = JSON.stringify(await respuesta.json());
    expect(texto).not.toContain('clinical-api.test');
    expect(lineas).toEqual([
      expect.objectContaining({ status: 502, motivo: 'clinical_api_inalcanzable' }),
    ]);
  });

  it('no registra filtros ni cookie en el log cuando reenvía el listado [US-048 AC-5]', async () => {
    clinicalApi.responderListado({ status: 200, cuerpo: ejemplo('patient-page-doctor.json') });
    const { dependencias, lineas } = crearDependenciasDeTest();

    await crearManejadorListadoDePacientes(dependencias)(
      peticionDeListado({ Cookie: COOKIE, Origin: ORIGEN_PERMITIDO }, '?status=activo'),
    );

    expect(lineas).toHaveLength(1);
    expect(JSON.stringify(lineas)).not.toContain('sesion-sintetica-1');
    expect(JSON.stringify(lineas)).not.toContain('activo');
  });
});
