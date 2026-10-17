import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorLogin } from '../../lib/server/auth-login';
import { ejemplo, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import {
  crearDependenciasDeLogin,
  crearLoginSimulado,
  peticionDeLogin,
} from '../support/login-simulado';

const clinicalApi = crearLoginSimulado();
const COOKIE = 'oncolens_session=abc; Path=/; HttpOnly; Secure; SameSite=Strict';
const credenciales = ejemplo('login-request.json');

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('POST /api/auth/login (bordes)', () => {
  it('responde 204 cuando el Content-Type es application/json con charset', async () => {
    clinicalApi.aceptar([COOKIE]);
    const { dependencias } = crearDependenciasDeLogin();

    const respuesta = await crearManejadorLogin(dependencias)(
      peticionDeLogin(
        { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json; charset=utf-8' },
        credenciales,
      ),
    );

    expect(respuesta.status).toBe(204);
  });

  it.each([
    ['el JSON está malformado', '{"email":'],
    ['falta la contraseña', { email: 'a@test.local' }],
    ['sobra una propiedad', { ...credenciales, extra: true }],
  ])('responde 422 CUERPO_INVALIDO sin request a clinical-api cuando %s', async (_caso, cuerpo) => {
    const { dependencias, lineas } = crearDependenciasDeLogin();

    const respuesta = await crearManejadorLogin(dependencias)(
      peticionDeLogin({ Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' }, cuerpo),
    );

    expect(respuesta.status).toBe(422);
    assertMatchesSpec(
      'clinical-api',
      '#/components/schemas/ErrorCuerpoInvalido',
      await respuesta.json(),
    );
    expect(clinicalApi.peticiones).toHaveLength(0);
    expect(lineas).toEqual([{ event: 'auth.login', status: 422, traceId: 'req_web00001' }]);
  });

  it('responde 422 cuando el cuerpo supera WEB_MAX_BODY_BYTES', async () => {
    const { dependencias } = crearDependenciasDeLogin();
    dependencias.config.maxBodyBytes = 10;

    const respuesta = await crearManejadorLogin(dependencias)(
      peticionDeLogin(
        { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' },
        credenciales,
      ),
    );

    expect(respuesta.status).toBe(422);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });

  it('responde 502 y registra sin_cookie_de_sesion cuando clinical-api acepta el login pero no emite la cookie', async () => {
    clinicalApi.aceptar(['interna=1; Path=/']);
    const { dependencias, lineas } = crearDependenciasDeLogin();

    const respuesta = await crearManejadorLogin(dependencias)(
      peticionDeLogin(
        { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' },
        credenciales,
      ),
    );

    expect(respuesta.status).toBe(502);
    expect(respuesta.headers.getSetCookie()).toEqual([]);
    expect(lineas.at(-1)).toMatchObject({ status: 502, motivo: 'sin_cookie_de_sesion' });
  });

  it('reexpone el Retry-After y el cuerpo cuando clinical-api responde 429', async () => {
    clinicalApi.rechazar(429, ejemplo('error-limite-solicitudes.json'), { 'Retry-After': '30' });
    const { dependencias } = crearDependenciasDeLogin();

    const respuesta = await crearManejadorLogin(dependencias)(
      peticionDeLogin(
        { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' },
        credenciales,
      ),
    );

    expect(respuesta.status).toBe(429);
    expect(respuesta.headers.get('retry-after')).toBe('30');
    expect(await respuesta.json()).toEqual(ejemplo('error-limite-solicitudes.json'));
  });
});
