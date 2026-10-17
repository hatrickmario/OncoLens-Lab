import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearManejadorLogin } from '../../lib/server/auth-login';
import { ejemplo, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import {
  crearDependenciasDeLogin,
  crearLoginSimulado,
  peticionDeLogin,
} from '../support/login-simulado';

const clinicalApi = crearLoginSimulado();
const COOKIE_VALIDA = 'oncolens_session=abc; Path=/; HttpOnly; Secure; SameSite=Strict';
const CABECERAS = { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' };
const credenciales = ejemplo('login-request.json');

// Forma de ErrorServicioAutenticacion hasta que llegue el contrato generado (tarea 1.2): se migra a
// assertMatchesSpec('#/components/schemas/ErrorServicioAutenticacion') en cuanto exista.
const ERROR_502 = {
  error: 'ERROR_SERVICIO_AUTENTICACION',
  message: 'El servicio de autenticación no respondió correctamente.',
  traceId: 'req_web00001',
};

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

async function iniciarSesion() {
  const { dependencias, lineas } = crearDependenciasDeLogin();
  const respuesta = await crearManejadorLogin(dependencias)(
    peticionDeLogin(CABECERAS, credenciales),
  );
  return { respuesta, lineas };
}

describe('POST /api/auth/login (fallos del proveedor)', () => {
  it('responde 502 ERROR_SERVICIO_AUTENTICACION sin URL ni cuerpo parcial cuando clinical-api es inalcanzable [US-211 AC-2]', async () => {
    clinicalApi.inalcanzable();

    const { respuesta, lineas } = await iniciarSesion();

    expect(respuesta.status).toBe(502);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual(ERROR_502);
    expect(JSON.stringify(cuerpo)).not.toContain('clinical-api.test');
    expect(respuesta.headers.getSetCookie()).toEqual([]);
    expect(lineas).toEqual([
      {
        event: 'auth.login',
        status: 502,
        traceId: 'req_web00001',
        motivo: 'clinical_api_inalcanzable',
      },
    ]);
  });

  it('retransmite el 500 ERROR_INTERNO sin cambios cuando clinical-api responde 500 [US-211 AC-2]', async () => {
    const interno = { error: 'ERROR_INTERNO', message: 'Error interno.', traceId: 'req_remoto01' };
    clinicalApi.rechazar(500, interno);

    const { respuesta } = await iniciarSesion();

    expect(respuesta.status).toBe(500);
    expect(await respuesta.json()).toEqual(interno);
  });

  it('responde 502 propio sin reenviar nada cuando clinical-api responde con un cuerpo que no es JSON', async () => {
    clinicalApi.responderTexto(503, '<html>upstream.interno:3000 caído</html>', 'text/html');

    const { respuesta, lineas } = await iniciarSesion();

    expect(respuesta.status).toBe(502);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toEqual(ERROR_502);
    expect(texto).not.toContain('upstream.interno');
    expect(lineas.at(-1)).toMatchObject({ status: 502, motivo: 'error_no_json' });
  });

  it('registra el traceId propio del BFF y aparte el de clinical-api cuando éste responde', async () => {
    clinicalApi.rechazar(401, ejemplo('error-credenciales-invalidas.json'), {
      'X-Trace-Id': 'req_remoto01',
    });

    const { lineas } = await iniciarSesion();

    expect(lineas).toEqual([
      {
        event: 'auth.login',
        status: 401,
        traceId: 'req_web00001',
        traceIdClinicalApi: 'req_remoto01',
      },
    ]);
  });

  it.each([
    ['falta HttpOnly', 'oncolens_session=abc; Path=/; Secure; SameSite=Strict'],
    ['falta Secure', 'oncolens_session=abc; Path=/; HttpOnly; SameSite=Strict'],
    ['SameSite no es Strict', 'oncolens_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax'],
    ['falta SameSite', 'oncolens_session=abc; Path=/; HttpOnly; Secure'],
    [
      'lleva Domain',
      'oncolens_session=abc; Path=/; Domain=oncolens.test; HttpOnly; Secure; SameSite=Strict',
    ],
  ])('responde 502 sin cookie y registra sin_cookie_de_sesion cuando %s', async (_caso, cookie) => {
    clinicalApi.aceptar([cookie]);

    const { respuesta, lineas } = await iniciarSesion();

    expect(respuesta.status).toBe(502);
    expect(respuesta.headers.getSetCookie()).toEqual([]);
    expect(lineas.at(-1)).toMatchObject({ status: 502, motivo: 'sin_cookie_de_sesion' });
  });

  it('retransmite la cookie intacta cuando trae HttpOnly, Secure y SameSite=Strict sin Domain', async () => {
    clinicalApi.aceptar([COOKIE_VALIDA]);

    const { respuesta } = await iniciarSesion();

    expect(respuesta.status).toBe(204);
    expect(respuesta.headers.getSetCookie()).toEqual([COOKIE_VALIDA]);
  });
});
