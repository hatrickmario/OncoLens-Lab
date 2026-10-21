import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  contarSesiones,
  contrasenaDeTest,
  cookiesEmitidas,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojAjustable,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1982;
const INICIO = '2026-10-16T12:00:00.000Z';
const PUNTERO_401 = '#/paths/~1platform~1auth~1login/post/responses/401';
const CONTRASENA_INCORRECTA = 'SINT-contrasena-incorrecta';

let cliente: Client;
const ids = generadorDeIds(ESPACIO_DE_IDS);
const creados: string[] = [];

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

/** Cada intento llega desde una IP distinta (documentación RFC 5737): aísla el bloqueo de la cuenta del de la IP. */
let aplicaciones = 0;
let siguienteIp = 0;
const ipNueva = () => `198.51.100.${(siguienteIp += 1)}`;

function intentar(app: ReturnType<typeof appDeTest>['app'], email: string, password: string) {
  return clienteVerificado(app)
    .post('/platform/auth/login')
    .set('X-Forwarded-For', ipNueva())
    .send({ email, password });
}

function appDeTest(token = 'tokenSinteticoBloqueoCuentaAAAAAAAAAAAAAAAAAAAAAAAA') {
  const reloj = relojAjustable(INICIO);
  const logger = loggerEnMemoria();
  const app = appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS * 10 + (aplicaciones += 1),
    tokens: tokensFijos(token),
    reloj,
    registrar: logger.registrar,
  });
  return { app, reloj, logger };
}

async function estadoDeBloqueo(userId: string) {
  const fila = await cliente.query<{ failed_login_count: number; locked_until: Date | null }>(
    'SELECT failed_login_count, locked_until FROM auth."user" WHERE id = $1',
    [userId],
  );
  const { failed_login_count: intentos, locked_until: hasta } = fila.rows[0] ?? {
    failed_login_count: -1,
    locked_until: null,
  };
  return { intentos, hasta: hasta?.toISOString() ?? null };
}

const sinTraceId = (cuerpo: Record<string, unknown>) => ({ ...cuerpo, traceId: undefined });

describe('bloqueo de la cuenta por intentos fallidos', () => {
  it('responde el 401 genérico sin crear sesión con la contraseña correcta durante el bloqueo y 204 al vencer el plazo [US-044 AC-2]', async () => {
    const doc = await usuarioNuevo('bloqueo');
    const { app, reloj } = appDeTest();
    const sesionesIniciales = await contarSesiones(cliente, [doc.id]);
    const erronea = await intentar(app, doc.email, CONTRASENA_INCORRECTA);
    for (let i = 1; i < 5; i += 1) await intentar(app, doc.email, CONTRASENA_INCORRECTA);
    expect(await estadoDeBloqueo(doc.id)).toEqual({
      intentos: 5,
      hasta: '2026-10-16T12:15:00.000Z',
    });
    // El bloqueo no revoca ni crea sesiones: el quinto fallo no cambia las que ya existían.
    expect(await contarSesiones(cliente, [doc.id])).toBe(sesionesIniciales);
    const sesionesAntes = await contarSesiones(cliente, [doc.id]);

    reloj.avanzarMinutos(14);
    const bloqueada = await intentar(app, doc.email, doc.password);

    expect(bloqueada.status).toBe(401);
    expect(bloqueada.headers['set-cookie']).toBeUndefined();
    assertMatchesSpec('clinical-api', PUNTERO_401, bloqueada.body);
    expect(sinTraceId(bloqueada.body)).toEqual(sinTraceId(erronea.body));
    expect(await contarSesiones(cliente, [doc.id])).toBe(sesionesAntes);
    expect(await estadoDeBloqueo(doc.id)).toEqual({
      intentos: 5,
      hasta: '2026-10-16T12:15:00.000Z',
    });

    reloj.avanzarMinutos(1);
    const desbloqueada = await intentar(app, doc.email, doc.password);

    expect(desbloqueada.status).toBe(204);
    expect(cookiesEmitidas(desbloqueada)).toHaveLength(1);
    expect(await contarSesiones(cliente, [doc.id])).toBe(sesionesAntes + 1);
    expect(await estadoDeBloqueo(doc.id)).toEqual({ intentos: 0, hasta: null });
  });

  it('cuenta de nuevo desde uno cuando falla tras vencer el plazo y no vuelve a bloquear de inmediato', async () => {
    const doc = await usuarioNuevo('reinicio');
    const { app, reloj } = appDeTest('tokenSinteticoBloqueoReinicioBBBBBBBBBBBBBBBBBBBBBBB');
    for (let i = 0; i < 5; i += 1) await intentar(app, doc.email, CONTRASENA_INCORRECTA);
    reloj.avanzarMinutos(15);

    const fallo = await intentar(app, doc.email, CONTRASENA_INCORRECTA);
    const acierto = await intentar(app, doc.email, doc.password);

    expect(fallo.status).toBe(401);
    expect(acierto.status).toBe(204);
  });

  it('no mueve el plazo ni el contador cuando llegan intentos durante el bloqueo', async () => {
    const doc = await usuarioNuevo('sinprorroga');
    const { app, reloj } = appDeTest();
    for (let i = 0; i < 5; i += 1) await intentar(app, doc.email, CONTRASENA_INCORRECTA);
    reloj.avanzarMinutos(5);

    await intentar(app, doc.email, CONTRASENA_INCORRECTA);

    expect(await estadoDeBloqueo(doc.id)).toEqual({
      intentos: 5,
      hasta: '2026-10-16T12:15:00.000Z',
    });
  });
});
