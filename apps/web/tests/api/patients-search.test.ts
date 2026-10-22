import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorBusquedaDePacientes } from '../../lib/server/patients';
import {
  crearDependenciasDeTest,
  ejemplo,
  ORIGEN_PERMITIDO,
} from '../support/clinical-api-simulado';
import { crearPacientesSimulado, peticionDeBusqueda } from '../support/pacientes-simulado';

const clinicalApi = crearPacientesSimulado();
const COOKIE = 'otra=x; oncolens_session=sesion-sintetica-1';
const VALIDAS = { Origin: ORIGEN_PERMITIDO, Cookie: COOKIE };

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('POST /api/patients/search', () => {
  it('responde 403 PERMISO_DENEGADO sin llamar a clinical-api cuando el Origin es ajeno [US-048 AC-5]', async () => {
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(
        { ...VALIDAS, Origin: 'https://evil.example' },
        ejemplo('patient-search.json'),
      ),
    );

    expect(respuesta.status).toBe(403);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorPermisoDenegado', cuerpo);
    expect(cuerpo).toMatchObject({ error: 'PERMISO_DENEGADO', traceId: 'req_web00001' });
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: 'patients.search.proxy', status: 403, traceId: 'req_web00001', motivo: 'origen' },
    ]);
  });

  it('responde 403 sin llamar a clinical-api cuando el Content-Type no es application/json [US-048 AC-5]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    const solicitud = new Request('http://web.test:3000/api/patients/search', {
      method: 'POST',
      headers: { ...VALIDAS, 'Content-Type': 'text/plain' },
      body: JSON.stringify(ejemplo('patient-search.json')),
    });

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(solicitud);

    expect(respuesta.status).toBe(403);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('reenvía la identidad solo en el cuerpo, con solo la cookie de sesión, y devuelve la página enmascarada con no-store [US-048 AC-5]', async () => {
    clinicalApi.responderBusqueda({
      status: 200,
      cuerpo: ejemplo('patient-page-doctor.json'),
      cabeceras: { 'Set-Cookie': 'interna=1' },
    });
    const { dependencias, lineas } = crearDependenciasDeTest();

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, ejemplo('patient-search.json')),
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/PatientPage', cuerpo);
    expect(cuerpo).toEqual(ejemplo('patient-page-doctor.json'));
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(respuesta.headers.get('set-cookie')).toBeNull();
    const enviada = clinicalApi.peticiones[0]!;
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('patient-search.json'));
    expect(new URL(enviada.url).search).toBe('');
    expect(enviada.url).not.toContain('SINT-');
    expect(enviada.cabeceras['cookie']).toBe('oncolens_session=sesion-sintetica-1');
    expect(enviada.cabeceras).not.toHaveProperty('origin');
    expect(JSON.stringify(lineas)).not.toContain('SINT-0000001');
    expect(JSON.stringify(lineas)).not.toContain('sesion-sintetica-1');
  });

  it('reenvía la búsqueda por nombre en el cuerpo y nunca en la URL ni en el log [US-048 AC-3]', async () => {
    clinicalApi.responderBusqueda({ status: 200, cuerpo: ejemplo('patient-page-doctor.json') });
    const { dependencias, lineas } = crearDependenciasDeTest();

    await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, ejemplo('patient-search-name.json')),
    );

    const enviada = clinicalApi.peticiones[0]!;
    expect(JSON.parse(enviada.cuerpo)).toEqual(ejemplo('patient-search-name.json'));
    expect(decodeURIComponent(enviada.url)).not.toContain('Prueba');
    expect(JSON.stringify(lineas)).not.toContain('Prueba');
  });

  it('responde 422 sin llamar a clinical-api ni repetir el valor cuando el cuerpo no es un criterio completo [US-048 AC-3]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, { idType: 'sintetico', apellido: 'Sintética' }),
    );

    expect(respuesta.status).toBe(422);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorCuerpoInvalido', cuerpo);
    expect(JSON.stringify(cuerpo)).not.toContain('Sintética');
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 422 sin llamar a clinical-api cuando el cuerpo trae un criterio válido y un campo no declarado [US-048 AC-3]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, { name: 'Prueba Sintética 1', apellido: 'x' }),
    );

    expect(respuesta.status).toBe(422);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 413 sin llamar a clinical-api cuando el cuerpo supera el máximo [US-048 AC-5]', async () => {
    const { dependencias } = crearDependenciasDeTest();

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, { name: 'x'.repeat(40_000) }),
    );

    expect(respuesta.status).toBe(413);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('reexpone el 401 NO_AUTENTICADO de clinical-api tal cual [US-048 AC-6]', async () => {
    const { dependencias } = crearDependenciasDeTest();
    clinicalApi.responderBusqueda({ status: 401, cuerpo: ejemplo('error-no-autenticado.json') });

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, ejemplo('patient-search.json')),
    );

    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toEqual(ejemplo('error-no-autenticado.json'));
  });

  it('responde 502 propio sin eco cuando clinical-api no responde dentro del plazo [US-048 AC-6]', async () => {
    clinicalApi.busquedaSinRespuesta();
    const { dependencias } = crearDependenciasDeTest({
      config: {
        clinicalApiUrl: 'http://clinical-api.test:3000',
        allowedOrigin: ORIGEN_PERMITIDO,
        upstreamTimeoutMs: 50,
        maxBodyBytes: 32768,
        homePath: '/pacientes/x/analisis',
      },
    });

    const respuesta = await crearManejadorBusquedaDePacientes(dependencias)(
      peticionDeBusqueda(VALIDAS, ejemplo('patient-search.json')),
    );

    expect(respuesta.status).toBe(502);
    expect(JSON.stringify(await respuesta.json())).not.toContain('SINT-0000001');
  });
});
