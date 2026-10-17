import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearManejadorLogin } from '../../app/api/auth/login/manejador';
import { ejemplo, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import {
  crearDependenciasDeLogin,
  crearLoginSimulado,
  invocarComoNext,
  peticionDeLogin,
} from '../support/login-simulado';

const clinicalApi = crearLoginSimulado();
const COOKIE_DE_SESION =
  'oncolens_session=tokenSinteticoDeSesionWebDDDDDDDDDDDDDDDDDDDDDDDDDDDDD; Path=/; HttpOnly; Secure; SameSite=Strict';
const TOKEN = 'tokenSinteticoDeSesionWebDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
const CABECERAS_VALIDAS = { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' };
const credenciales = ejemplo('login-request.json') as { email: string; password: string };

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

describe('POST /api/auth/login', () => {
  it('retransmite solo la cookie oncolens_session y responde 204 cuando clinical-api acepta el login; reexpone el 401 cuando lo rechaza; sin contraseña ni token en sus logs [US-211 AC-1] [US-211 AC-2] [US-211 AC-6]', async () => {
    const { dependencias, lineas } = crearDependenciasDeLogin();
    const manejador = crearManejadorLogin(dependencias);

    clinicalApi.aceptar([COOKIE_DE_SESION, 'interna=1; Path=/']);
    const aceptado = await invocarComoNext(
      manejador,
      peticionDeLogin({ ...CABECERAS_VALIDAS, Cookie: 'oncolens_session=previa' }, credenciales),
    );

    expect(aceptado.status).toBe(204);
    expect(await aceptado.text()).toBe('');
    expect(aceptado.headers.getSetCookie()).toEqual([COOKIE_DE_SESION]);
    expect(clinicalApi.peticiones).toHaveLength(1);
    const enviada = clinicalApi.peticiones[0]!;
    expect(JSON.parse(enviada.cuerpo)).toEqual(credenciales);
    expect(enviada.cabeceras).not.toHaveProperty('cookie');
    expect(enviada.cabeceras).not.toHaveProperty('origin');

    clinicalApi.reiniciar();
    clinicalApi.rechazar(401, ejemplo('error-credenciales-invalidas.json'), {
      'Set-Cookie': 'interna=1',
    });
    const rechazado = await invocarComoNext(
      manejador,
      peticionDeLogin(CABECERAS_VALIDAS, credenciales),
    );

    expect(rechazado.status).toBe(401);
    const cuerpo = await rechazado.json();
    assertMatchesSpec('clinical-api', '#/components/schemas/ErrorCredencialesInvalidas', cuerpo);
    expect(cuerpo).toEqual(ejemplo('error-credenciales-invalidas.json'));
    expect(rechazado.headers.getSetCookie()).toEqual([]);

    const registro = JSON.stringify(lineas);
    expect(lineas.map((linea) => linea.status)).toEqual([204, 401]);
    expect(registro).not.toContain(credenciales.password);
    expect(registro).not.toContain(credenciales.email);
    expect(registro).not.toContain(TOKEN);
  });

  it.each([
    [
      'el Origin es de otro sitio',
      { Origin: 'https://otro-origen.test', 'Content-Type': 'application/json' },
      'origen',
    ],
    [
      'el Content-Type no es application/json',
      { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/x-www-form-urlencoded' },
      'content_type',
    ],
  ])(
    'responde 403 PERMISO_DENEGADO sin ningún request a clinical-api cuando %s',
    async (_caso, cabeceras, motivo) => {
      const { dependencias, lineas } = crearDependenciasDeLogin();
      clinicalApi.aceptar([COOKIE_DE_SESION]);

      const respuesta = await invocarComoNext(
        crearManejadorLogin(dependencias),
        peticionDeLogin(cabeceras, credenciales),
      );

      expect(respuesta.status).toBe(403);
      const cuerpo = await respuesta.json();
      assertMatchesSpec('clinical-api', '#/components/schemas/ErrorPermisoDenegado', cuerpo);
      expect(cuerpo).toMatchObject({ error: 'PERMISO_DENEGADO', traceId: 'req_web00001' });
      expect(respuesta.headers.getSetCookie()).toEqual([]);
      expect(clinicalApi.peticiones).toHaveLength(0);
      expect(lineas).toEqual([
        { event: 'auth.login', status: 403, traceId: 'req_web00001', motivo },
      ]);
      expect(JSON.stringify(lineas)).not.toContain(credenciales.password);
    },
  );

  it('responde 403 sin ningún request a clinical-api cuando falta la cabecera Origin', async () => {
    const { dependencias } = crearDependenciasDeLogin();

    const respuesta = await invocarComoNext(
      crearManejadorLogin(dependencias),
      peticionDeLogin({ 'Content-Type': 'application/json' }, credenciales),
    );

    expect(respuesta.status).toBe(403);
    expect(clinicalApi.peticiones).toHaveLength(0);
  });
});
