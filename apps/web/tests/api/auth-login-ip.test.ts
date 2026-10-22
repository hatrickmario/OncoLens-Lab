import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearManejadorLogin } from '../../lib/server/auth-login';
import { CABECERA_IP_DEL_SOCKET, firmarIpDelSocket } from '../../lib/server/cabecera-ip-del-socket';
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

/** Hace el login con las cabeceras dadas (sin la IP firmada por defecto) y devuelve la respuesta y lo que vio clinical-api. */
async function loginConCabeceras(extra: Record<string, string>) {
  const { dependencias, lineas } = crearDependenciasDeLogin();
  clinicalApi.aceptar([COOKIE]);
  const respuesta = await crearManejadorLogin(dependencias)(
    peticionDeLogin({ ...CABECERAS, ...extra }, credenciales),
  );
  return { respuesta, lineas, upstream: clinicalApi.peticiones };
}

const conIpFirmada = (ip: string) => ({ [CABECERA_IP_DEL_SOCKET]: firmarIpDelSocket(ip) });

describe('POST /api/auth/login y la IP del cliente', () => {
  it('reenvía a clinical-api la IP que web firmó como X-Forwarded-For [US-044 AC-3]', async () => {
    const { upstream } = await loginConCabeceras(conIpFirmada('198.51.100.7'));

    expect(upstream[0]?.cabeceras['x-forwarded-for']).toBe('198.51.100.7');
  });

  it('ignora el X-Forwarded-For del cliente cuando trae además la IP firmada [US-044 AC-3]', async () => {
    const { upstream } = await loginConCabeceras({
      ...conIpFirmada('198.51.100.7'),
      'X-Forwarded-For': '203.0.113.66',
    });

    expect(upstream[0]?.cabeceras['x-forwarded-for']).toBe('198.51.100.7');
  });

  it('normaliza la forma IPv4 mapeada a IPv6 antes de reenviarla', async () => {
    const { upstream } = await loginConCabeceras(conIpFirmada('::ffff:198.51.100.7'));

    expect(upstream[0]?.cabeceras['x-forwarded-for']).toBe('198.51.100.7');
  });

  it.each([
    ['solo X-Forwarded-For del cliente', { 'X-Forwarded-For': '203.0.113.66' }],
    ['una firma que no es la del proceso', { [CABECERA_IP_DEL_SOCKET]: 'ajeno|203.0.113.66' }],
    ['un valor firmado que no es una IP', conIpFirmada('no-es-una-ip')],
  ])(
    'responde 502 propio sin llamar a clinical-api cuando el login llega con %s [US-044 AC-3]',
    async (_caso, cabeceras) => {
      const sinFirma = { [CABECERA_IP_DEL_SOCKET]: '', ...cabeceras };
      const { respuesta, lineas, upstream } = await loginConCabeceras(sinFirma);

      expect(respuesta.status).toBe(502);
      expect(upstream).toHaveLength(0);
      expect(lineas).toEqual([
        {
          event: 'auth.login',
          status: 502,
          traceId: 'req_web00001',
          motivo: 'sin_ip_del_cliente',
        },
      ]);
    },
  );
});
