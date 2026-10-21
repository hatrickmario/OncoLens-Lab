import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearRegistrador } from '../../../src/infrastructure/logger.js';
import { appConAuth } from '../../support/app-auth.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import { conectar } from '../../support/db.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  contarSesiones,
  contrasenaDeTest,
  insertarUsuario,
  limpiarUsuarios,
  relojAjustable,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1983;
const IP_ATACANTE = '198.51.100.7';
const IP_INYECTADA = '203.0.113.9';
const PUNTERO_401 = '#/paths/~1platform~1auth~1login/post/responses/401';
const CONTRASENA_INCORRECTA = 'SINT-contrasena-incorrecta';

let cliente: Client;
let administrador: UsuarioDeTest;
const ids = generadorDeIds(ESPACIO_DE_IDS);
let aplicaciones = 0;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  const rolId = await asegurarRol(cliente, ids, 'admin');
  administrador = await insertarUsuario(cliente, ids, {
    email: `admin.${ESPACIO_DE_IDS}@test.local`,
    password: contrasenaDeTest('TEST_DOC2_PASSWORD'),
    rolId,
  });
});

afterAll(async () => {
  await limpiarUsuarios(cliente, [administrador.id]);
  await cliente.end();
});

function appDeTest(token: string) {
  const reloj = relojAjustable();
  const lineas: string[] = [];
  const app = appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS * 10 + (aplicaciones += 1),
    tokens: tokensFijos(token),
    reloj,
    registrar: crearRegistrador((linea) => lineas.push(linea)),
  });
  return { app, reloj, lineas };
}

type App = ReturnType<typeof appDeTest>['app'];

function intentar(app: App, ipsDeLaCabecera: string, email: string, password: string) {
  return clienteVerificado(app)
    .post('/platform/auth/login')
    .set('X-Forwarded-For', ipsDeLaCabecera)
    .send({ email, password });
}

/** Cinco fallos desde la misma IP sobre cinco cuentas distintas (ninguna acumula cinco por sí sola). */
async function cincoFallosDesdeLaIp(app: App, ip: string) {
  for (let i = 1; i <= 5; i += 1) {
    await intentar(app, ip, `intruso${i}.${ESPACIO_DE_IDS}@test.local`, CONTRASENA_INCORRECTA);
  }
}

async function fallosDeLaCuenta(userId: string): Promise<number> {
  const fila = await cliente.query<{ failed_login_count: number }>(
    'SELECT failed_login_count FROM auth."user" WHERE id = $1',
    [userId],
  );
  return fila.rows[0]?.failed_login_count ?? -1;
}

describe('bloqueo por IP', () => {
  it('responde el 401 genérico a una IP con cinco fallos aunque las credenciales de otra cuenta sean correctas [US-044 AC-3]', async () => {
    const { app, lineas } = appDeTest('tokenSinteticoBloqueoIpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    await cincoFallosDesdeLaIp(app, IP_ATACANTE);
    const sesionesAntes = await contarSesiones(cliente, [administrador.id]);
    lineas.length = 0;

    const respuesta = await intentar(app, IP_ATACANTE, administrador.email, administrador.password);

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers['set-cookie']).toBeUndefined();
    assertMatchesSpec('clinical-api', PUNTERO_401, respuesta.body);
    expect(respuesta.body.error).toBe('CREDENCIALES_INVALIDAS');
    expect(await contarSesiones(cliente, [administrador.id])).toBe(sesionesAntes);
    expect(await fallosDeLaCuenta(administrador.id)).toBe(0);
    const log = lineas.join('\n');
    expect(log).toContain('"motivo":"bloqueo_ip"');
    expect(log).not.toContain(IP_ATACANTE);
    expect(log).not.toContain('test.local');
  });

  it('atribuye el intento al salto de confianza e ignora el X-Forwarded-For inyectado [US-044 AC-3]', async () => {
    const { app } = appDeTest('tokenSinteticoBloqueoIpBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    await cincoFallosDesdeLaIp(app, IP_ATACANTE);

    const inyeccionAlPrincipio = await intentar(
      app,
      `${IP_INYECTADA}, ${IP_ATACANTE}`,
      administrador.email,
      administrador.password,
    );
    const inyeccionAlFinal = await intentar(
      app,
      `${IP_ATACANTE}, ${IP_INYECTADA}`,
      administrador.email,
      administrador.password,
    );

    // El último valor lo escribe web (único salto de confianza); lo anterior lo puso el cliente y no cuenta.
    expect(inyeccionAlPrincipio.status).toBe(401);
    expect(inyeccionAlFinal.status).toBe(204);
  });

  it('desbloquea la IP cuando vence el plazo de bloqueo', async () => {
    const { app, reloj } = appDeTest('tokenSinteticoBloqueoIpCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
    await cincoFallosDesdeLaIp(app, IP_ATACANTE);
    reloj.avanzarMinutos(14);
    const durante = await intentar(app, IP_ATACANTE, administrador.email, administrador.password);
    reloj.avanzarMinutos(1);

    const despues = await intentar(app, IP_ATACANTE, administrador.email, administrador.password);

    expect(durante.status).toBe(401);
    expect(despues.status).toBe(204);
  });

  it('no escribe la IP ni el correo en consola ni en los flujos estándar cuando bloquea por IP, con una sonda que prueba la captura [US-044 AC-3]', async () => {
    const reloj = relojAjustable();
    const app = appConAuth({
      cliente,
      espacio: ESPACIO_DE_IDS * 10 + (aplicaciones += 1),
      tokens: tokensFijos('tokenSinteticoBloqueoIpDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'),
      reloj,
      // Igual que producción: el registrador escribe cada línea con console.info.
      registrar: crearRegistrador((linea) => console.info(linea)),
    });

    const salidas = await capturarSalidas(async () => {
      await cincoFallosDesdeLaIp(app, IP_ATACANTE);
      await intentar(app, IP_ATACANTE, administrador.email, administrador.password);
      // Sonda de mutación: si la captura no vigilara console.*, esta línea no aparecería y el test fallaría.
      console.info(`sonda ${IP_ATACANTE}`);
    });

    expect(salidas).toContain('"motivo":"bloqueo_ip"');
    expect(salidas).toContain(`sonda ${IP_ATACANTE}`);
    expect(salidas.replace(`sonda ${IP_ATACANTE}`, '')).not.toContain(IP_ATACANTE);
    expect(salidas).not.toContain('test.local');
  });
});
