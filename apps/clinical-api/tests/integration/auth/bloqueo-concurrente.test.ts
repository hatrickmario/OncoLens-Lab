import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createRegistroDeIntentosPorIp } from '../../../src/infrastructure/intentos-por-ip.memoria.js';
import { createAuthRepository } from '../../../src/modules/auth/auth.repository.js';
import {
  createAuthService,
  CredencialesInvalidasError,
} from '../../../src/modules/auth/auth.service.js';
import { createPasswordHasher } from '../../../src/modules/auth/password-hasher.js';
import { CONFIG_DE_SESION_DE_TEST, CONFIG_DE_TEST } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  ARGON2_DE_PRUEBA,
  asegurarRol,
  contarSesiones,
  contrasenaDeTest,
  insertarUsuario,
  limpiarUsuarios,
  relojFijo,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

/**
 * Peticiones CONCURRENTES contra los dos bloqueos (Gate 2, SEG-01). Se llama al servicio con la conexión única de test:
 * las consultas salen en el orden de las llamadas, así el orden de las reservas es determinista y lo único que se
 * ejercita es que el intento se reserva ANTES de verificar la contraseña.
 */

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1986;
const MAL = 'SINT-contrasena-incorrecta';
const MAX_INTENTOS = CONFIG_DE_SESION_DE_TEST.loginMaxFailedAttempts;

let cliente: Client;
const ids = generadorDeIds(ESPACIO_DE_IDS);
const creados: string[] = [];
let tokensEmitidos = 0;

beforeAll(async () => {
  cliente = await conectar(urlBase);
});

afterAll(async () => {
  await limpiarUsuarios(cliente, creados);
  await cliente.end();
});

async function usuarioNuevo(alias: string): Promise<UsuarioDeTest> {
  const rolId = await asegurarRol(cliente, ids, 'doctor');
  const usuario = await insertarUsuario(cliente, ids, {
    email: `${alias}.${ESPACIO_DE_IDS}@test.local`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId,
  });
  creados.push(usuario.id);
  return usuario;
}

function servicioReal() {
  const reloj = relojFijo();
  return createAuthService({
    repo: createAuthRepository(cliente),
    hasher: createPasswordHasher(ARGON2_DE_PRUEBA),
    tokens: { nuevo: () => `tokenSinteticoConcurrente${(tokensEmitidos += 1)}` },
    ids: generadorDeIds(ESPACIO_DE_IDS * 10 + tokensEmitidos + 1),
    reloj,
    config: CONFIG_DE_TEST,
    sesion: CONFIG_DE_SESION_DE_TEST,
    registroDeIntentosPorIp: createRegistroDeIntentosPorIp({
      reloj,
      maxIntentos: CONFIG_DE_SESION_DE_TEST.loginMaxFailedAttempts,
      ventanaMinutos: CONFIG_DE_SESION_DE_TEST.loginLockoutMinutes,
    }),
  });
}

type Servicio = ReturnType<typeof servicioReal>;

/** Resultado de cada intento: `ok` si abrió sesión, o el motivo cerrado del rechazo. */
async function intentar(servicio: Servicio, email: string, password: string, ip: string) {
  try {
    await servicio.iniciarSesion({ email, password }, ip);
    return 'ok';
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) return error.motivo;
    throw error;
  }
}

async function intentosDeLaCuenta(userId: string): Promise<number> {
  const fila = await cliente.query<{ failed_login_count: number }>(
    'SELECT failed_login_count FROM auth."user" WHERE id = $1',
    [userId],
  );
  return fila.rows[0]?.failed_login_count ?? -1;
}

describe('bloqueos con peticiones concurrentes', () => {
  it('evalúa como mucho LOGIN_MAX_FAILED_ATTEMPTS contraseñas de una cuenta cuando llegan 20 intentos erróneos a la vez [US-044 AC-2]', async () => {
    const doc = await usuarioNuevo('rafaga20');
    const servicio = servicioReal();

    await Promise.all(
      Array.from({ length: 20 }, (_, i) => intentar(servicio, doc.email, MAL, `192.0.2.${i + 1}`)),
    );

    expect(await intentosDeLaCuenta(doc.id)).toBe(MAX_INTENTOS);
  });

  it('responde 401 y no abre sesión cuando la contraseña correcta llega en la misma ráfaga tras cuatro fallos y ocho intentos erróneos [US-044 AC-2]', async () => {
    const doc = await usuarioNuevo('rafagaconcorrecta');
    const servicio = servicioReal();
    for (let i = 0; i < 4; i += 1) await intentar(servicio, doc.email, MAL, `192.0.2.${100 + i}`);
    const sesionesAntes = await contarSesiones(cliente, [doc.id]);

    const resultados = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) =>
        intentar(servicio, doc.email, MAL, `192.0.2.${150 + i}`),
      ),
      intentar(servicio, doc.email, doc.password, '192.0.2.200'),
    ]);

    expect(resultados[8]).not.toBe('ok');
    expect(await contarSesiones(cliente, [doc.id])).toBe(sesionesAntes);
    expect(await intentosDeLaCuenta(doc.id)).toBe(MAX_INTENTOS);
  });

  it('evalúa como mucho LOGIN_MAX_FAILED_ATTEMPTS contraseñas cuando 20 cuentas distintas reciben un intento a la vez desde la misma IP [US-044 AC-3]', async () => {
    const cuentas = await Promise.all(
      Array.from({ length: 20 }, (_, i) => usuarioNuevo(`ipconcurrente${i}`)),
    );
    const servicio = servicioReal();

    await Promise.all(cuentas.map((c) => intentar(servicio, c.email, MAL, '198.51.100.123')));

    let evaluados = 0;
    for (const cuenta of cuentas) evaluados += await intentosDeLaCuenta(cuenta.id);
    expect(evaluados).toBe(MAX_INTENTOS);
  });

  it('no abre sesión con la contraseña correcta cuando la IP ya agotó sus intentos en la misma ráfaga [US-044 AC-3]', async () => {
    const victima = await usuarioNuevo('victimaip');
    const servicio = servicioReal();
    const ip = '198.51.100.124';
    for (let i = 0; i < 4; i += 1)
      await intentar(servicio, `nadie${i}.${ESPACIO_DE_IDS}@test.local`, MAL, ip);

    const resultados = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) =>
        intentar(servicio, `nadie${10 + i}.${ESPACIO_DE_IDS}@test.local`, MAL, ip),
      ),
      intentar(servicio, victima.email, victima.password, ip),
    ]);

    expect(resultados[8]).toBe('bloqueo_ip');
    expect(await contarSesiones(cliente, [victima.id])).toBe(0);
  });
});
