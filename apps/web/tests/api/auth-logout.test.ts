import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorLogout } from '../../lib/server/auth-logout';
import { ejemplo, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import { crearDependenciasDeLogin, invocarComoNext } from '../support/login-simulado';
import { crearLogoutSimulado, peticionDeLogout } from '../support/logout-simulado';

const clinicalApi = crearLogoutSimulado();
const COOKIE_BORRADA =
  'oncolens_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict';
const CABECERAS_VALIDAS = {
  Origin: ORIGEN_PERMITIDO,
  Cookie: 'tema=oscuro; oncolens_session=tokenSinteticoLogoutWebAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('POST /api/auth/logout', () => {
  it('responde 403 PERMISO_DENEGADO sin ningún request a clinical-api y la sesión sigue activa cuando el Origin del logout es ajeno [US-044 AC-5]', async () => {
    const { dependencias, lineas } = crearDependenciasDeLogin();
    clinicalApi.aceptar([COOKIE_BORRADA]);

    const respuesta = await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout({ ...CABECERAS_VALIDAS, Origin: 'https://evil.example' }),
    );

    expect(respuesta.status).toBe(403);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorPermisoDenegado', cuerpo);
    expect(cuerpo).toMatchObject({ error: 'PERMISO_DENEGADO', traceId: 'req_web00001' });
    expect(respuesta.headers.getSetCookie()).toEqual([]);
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([
      { event: 'auth.logout', status: 403, traceId: 'req_web00001', motivo: 'origen' },
    ]);
  });

  it('retransmite el 204 y borra la cookie cuando clinical-api acepta el logout, enviándole solo la cookie de sesión [US-044 AC-1]', async () => {
    const { dependencias, lineas } = crearDependenciasDeLogin();
    clinicalApi.aceptar([COOKIE_BORRADA, 'interna=1; Path=/']);

    const respuesta = await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout(CABECERAS_VALIDAS),
    );

    expect(respuesta.status).toBe(204);
    expect(await respuesta.text()).toBe('');
    expect(respuesta.headers.getSetCookie()).toEqual([COOKIE_BORRADA]);
    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(enviada.cabeceras['cookie']).toBe(
      'oncolens_session=tokenSinteticoLogoutWebAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(enviada.cabeceras).not.toHaveProperty('origin');
    expect(lineas).toEqual([{ event: 'auth.logout', status: 204, traceId: 'req_web00001' }]);
    expect(JSON.stringify(lineas)).not.toContain('tokenSintetico');
  });

  it('reexpone el 401 NO_AUTENTICADO sin cookies cuando clinical-api responde que la sesión no existe [US-044 AC-1]', async () => {
    const { dependencias } = crearDependenciasDeLogin();
    clinicalApi.rechazar(401, ejemplo('error-no-autenticado.json'));

    const respuesta = await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout(CABECERAS_VALIDAS),
    );

    expect(respuesta.status).toBe(401);
    const cuerpo = await respuesta.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorNoAutenticado', cuerpo);
    expect(cuerpo).toEqual(ejemplo('error-no-autenticado.json'));
    expect(respuesta.headers.getSetCookie()).toEqual([]);
  });

  it('no retransmite una cookie borrada insegura ni cuerpo cuando clinical-api responde algo fuera del contrato', async () => {
    const { dependencias } = crearDependenciasDeLogin();
    clinicalApi.aceptar(['oncolens_session=; Max-Age=0; Path=/; Domain=evil.example']);

    const respuesta = await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout(CABECERAS_VALIDAS),
    );

    expect(respuesta.status).toBe(502);
    expect(respuesta.headers.getSetCookie()).toEqual([]);
  });

  it('responde 502 ERROR_SERVICIO_AUTENTICACION sin URL interna cuando clinical-api es inalcanzable', async () => {
    const { dependencias } = crearDependenciasDeLogin();
    clinicalApi.inalcanzable();

    const respuesta = await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout(CABECERAS_VALIDAS),
    );

    expect(respuesta.status).toBe(502);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toMatchObject({ error: 'ERROR_SERVICIO_AUTENTICACION' });
    expect(JSON.stringify(cuerpo)).not.toContain('clinical-api.test');
  });

  it('reenvía a clinical-api la IP que web fijó en X-Forwarded-For [US-044 AC-3]', async () => {
    const { dependencias } = crearDependenciasDeLogin();
    clinicalApi.aceptar([COOKIE_BORRADA]);

    await invocarComoNext(
      crearManejadorLogout(dependencias),
      peticionDeLogout({ ...CABECERAS_VALIDAS, 'X-Forwarded-For': '198.51.100.7' }),
    );

    expect(clinicalApi.peticiones[0]?.cabeceras['x-forwarded-for']).toBe('198.51.100.7');
  });
});
