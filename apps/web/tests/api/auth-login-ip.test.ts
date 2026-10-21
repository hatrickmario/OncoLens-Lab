import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearManejadorLogin } from '../../lib/server/auth-login';
import { ejemplo, ORIGEN_PERMITIDO } from '../support/clinical-api-simulado';
import {
  crearDependenciasDeLogin,
  crearLoginSimulado,
  peticionDeLogin,
} from '../support/login-simulado';

const clinicalApi = crearLoginSimulado();
const CABECERAS = { Origin: ORIGEN_PERMITIDO, 'Content-Type': 'application/json' };
const credenciales = ejemplo('login-request.json');
const COOKIE = 'oncolens_session=abc; Path=/; HttpOnly; Secure; SameSite=Strict';

beforeAll(() => clinicalApi.iniciar());
afterEach(() => clinicalApi.reiniciar());
afterAll(() => clinicalApi.detener());

async function loginConXForwardedFor(valor: string | undefined) {
  const { dependencias } = crearDependenciasDeLogin();
  clinicalApi.aceptar([COOKIE]);
  const cabeceras = valor === undefined ? CABECERAS : { ...CABECERAS, 'X-Forwarded-For': valor };
  await crearManejadorLogin(dependencias)(peticionDeLogin(cabeceras, credenciales));
  return clinicalApi.peticiones[0]?.cabeceras['x-forwarded-for'];
}

describe('POST /api/auth/login y la IP del cliente', () => {
  it('reenvía a clinical-api la IP que web fijó en X-Forwarded-For [US-044 AC-3]', async () => {
    expect(await loginConXForwardedFor('198.51.100.7')).toBe('198.51.100.7');
  });

  it('reenvía solo el último valor y descarta lo anterior cuando la cabecera trae una lista', async () => {
    expect(await loginConXForwardedFor('203.0.113.9, 198.51.100.7')).toBe('198.51.100.7');
  });

  it('normaliza la forma IPv4 mapeada a IPv6 antes de reenviarla', async () => {
    expect(await loginConXForwardedFor('::ffff:198.51.100.7')).toBe('198.51.100.7');
  });

  it.each(['no-es-una-ip', '198.51.100.7:8080', ''])(
    'no reenvía X-Forwarded-For cuando el valor %j no es una IP',
    async (valor) => {
      expect(await loginConXForwardedFor(valor)).toBeUndefined();
    },
  );

  it('no inventa X-Forwarded-For cuando la petición no lo trae', async () => {
    expect(await loginConXForwardedFor(undefined)).toBeUndefined();
  });
});
