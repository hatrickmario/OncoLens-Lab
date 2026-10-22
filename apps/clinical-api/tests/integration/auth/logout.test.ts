import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { crearRegistrador } from '../../../src/infrastructure/logger.js';
import { logoutController } from '../../../src/modules/auth/auth.controller.js';
import { appConAuth } from '../../support/app-auth.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import { conectar } from '../../support/db.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { incoherencias } from '../../support/rutas-y-contrato.js';
import { asegurarPermisos, crearRolDePrueba } from '../../support/roles.js';
import {
  contrasenaDeTest,
  cookiesEmitidas,
  insertarSesion,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  traceIdsFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1981;
const PUNTERO_LOGOUT = '#/paths/~1platform~1auth~1logout/post/responses';
/** Ruta de mentira que ejercita el guard: el contrato no la describe; solo su 200 y el 401 del guard se declaran ajenos. */
const RUTA_DE_PRUEBA = '/platform/ruta-protegida-de-prueba';
const RUTA_DE_MENTIRA = {
  respuestasAjenasAlContrato: [
    { ruta: RUTA_DE_PRUEBA, status: 200 },
    { ruta: RUTA_DE_PRUEBA, status: 401, esquema: '#/components/responses/NoAutenticado' },
  ],
};
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');

let cliente: Client;
let doc1: UsuarioDeTest;
const ids = generadorDeIds(ESPACIO_DE_IDS);

/** Ruta protegida de prueba (no devuelve datos): hace de `GET /platform/patients` hasta que exista la ficha. */
function rutaProtegidaDePrueba(): Router {
  const ruta = Router();
  ruta.get('/ruta-protegida-de-prueba', (_peticion, respuesta) => {
    respuesta.status(200).json({ ok: true });
  });
  return ruta;
}

beforeAll(async () => {
  cliente = await conectar(urlBase);
  await asegurarPermisos(cliente, ids, ['session:logout']);
  const rolId = await crearRolDePrueba(cliente, ids, `logout.${ESPACIO_DE_IDS}`, [
    'session:logout',
  ]);
  doc1 = await insertarUsuario(cliente, ids, {
    email: `doc1.${ESPACIO_DE_IDS}@test.local`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId,
  });
});

afterAll(async () => {
  await limpiarUsuarios(cliente, [doc1.id]);
  await cliente.end();
});

function app() {
  return appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS,
    tokens: tokensFijos('no-se-usa'),
    reloj: relojFijo(),
    registrar: loggerEnMemoria().registrar,
    rutasProtegidas: [rutaProtegidaDePrueba()],
  });
}

async function revocada(token: string): Promise<boolean> {
  const fila = await cliente.query<{ revoked: boolean }>(
    'SELECT revoked FROM auth.session WHERE token_hash = $1',
    [hashDe(token)],
  );
  return fila.rows[0]?.revoked ?? false;
}

describe('POST /platform/auth/logout', () => {
  it('revoca la sesión y la cookie responde 401 en la ruta protegida cuando el doctor cierra sesión [US-044 AC-1]', async () => {
    const token = 'tokenSinteticoLogoutAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe(token),
      expiresAt: '2026-10-16T20:00:00.000Z',
    });
    const cookie = `oncolens_session=${token}`;
    const previa = await clienteVerificado(app(), RUTA_DE_MENTIRA)
      .get(RUTA_DE_PRUEBA)
      .set('Cookie', cookie);
    expect(previa.status).toBe(200);

    const respuesta = await clienteVerificado(app())
      .post('/platform/auth/logout')
      .set('Cookie', cookie);

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    const borrada = cookiesEmitidas(respuesta).find((valor) =>
      valor.startsWith('oncolens_session='),
    );
    expect(borrada).toMatch(/^oncolens_session=;/);
    expect(borrada).toMatch(/Max-Age=0/i);
    expect(borrada).toMatch(/HttpOnly/);
    expect(borrada).toMatch(/Secure/);
    expect(borrada).toMatch(/SameSite=Strict/);
    expect(await revocada(token)).toBe(true);

    const posterior = await clienteVerificado(app(), RUTA_DE_MENTIRA)
      .get(RUTA_DE_PRUEBA)
      .set('Cookie', cookie);
    expect(posterior.status).toBe(401);
    assertMatchesSpec('clinical-api', '#/components/responses/NoAutenticado', posterior.body);
    expect(posterior.body.error).toBe('NO_AUTENTICADO');
  });

  it('responde 401 sin modificar sesiones cuando el logout llega sin cookie o con una sesión ya revocada [US-044 AC-1]', async () => {
    const vigente = 'tokenSinteticoLogoutVigenteBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const yaRevocado = 'tokenSinteticoLogoutRevocadoCCCCCCCCCCCCCCCCCCCCCCCCC';
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe(vigente),
      expiresAt: '2026-10-16T20:00:00.000Z',
    });
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe(yaRevocado),
      expiresAt: '2026-10-16T20:00:00.000Z',
      revoked: true,
    });

    const sinCookie = await clienteVerificado(app()).post('/platform/auth/logout');
    const conRevocada = await clienteVerificado(app())
      .post('/platform/auth/logout')
      .set('Cookie', `oncolens_session=${yaRevocado}`);

    for (const respuesta of [sinCookie, conRevocada]) {
      expect(respuesta.status).toBe(401);
      assertMatchesSpec('clinical-api', `${PUNTERO_LOGOUT}/401`, respuesta.body);
      expect(respuesta.body.error).toBe('NO_AUTENTICADO');
      expect(respuesta.headers['set-cookie']).toBeUndefined();
    }
    expect(await revocada(vigente)).toBe(false);
  });
});

describe('logs del logout', () => {
  it('no escribe el token, la cookie ni el correo en consola ni en los flujos estándar, con una sonda que prueba la captura [US-044 AC-1]', async () => {
    const token = 'tokenSinteticoLogoutLogsDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe(token),
      expiresAt: '2026-10-16T20:00:00.000Z',
    });
    const aplicacion = appConAuth({
      cliente,
      espacio: ESPACIO_DE_IDS,
      tokens: tokensFijos('no-se-usa'),
      reloj: relojFijo(),
      // Igual que producción: el registrador escribe cada línea con console.info.
      registrar: crearRegistrador((linea) => console.info(linea)),
    });

    const salidas = await capturarSalidas(async () => {
      await clienteVerificado(aplicacion)
        .post('/platform/auth/logout')
        .set('Cookie', `oncolens_session=${token}`);
      // Sonda de mutación: si la captura no vigilara console.*, esta línea no aparecería y el test fallaría.
      console.info(`sonda ${token}`);
    });

    expect(salidas).toContain('"event":"auth.logout"');
    expect(salidas).toContain(`sonda ${token}`);
    const sinSonda = salidas.replace(`sonda ${token}`, '');
    expect(sinSonda).not.toContain(token);
    expect(sinSonda).not.toContain('oncolens_session');
    expect(sinSonda).not.toContain('test.local');
  });
});

describe('coherencia del logout con el contrato', () => {
  it('monta POST /platform/auth/logout con authorize(session:logout) igual que su x-permission', () => {
    const router = logoutController({
      service: { cerrarSesion: () => Promise.resolve() },
      nuevoTraceId: traceIdsFijos(),
      registrar: loggerEnMemoria().registrar,
    });

    expect(incoherencias([router])).toEqual([]);
  });
});
