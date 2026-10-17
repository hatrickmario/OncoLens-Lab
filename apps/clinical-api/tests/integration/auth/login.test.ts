import { createHash } from 'node:crypto';
import request from 'supertest';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import {
  contarSesiones,
  cookiesEmitidas,
  CONTRASENA_DOC1,
  crearUsuariosDeAuth,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 101;
const TOKEN_EMITIDO = 'tokenSinteticoDeSesionUnoAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const COOKIE_PREVIA = 'cookiePreviaArbitrariaQueNoDebeReutilizarse';
const PUNTERO_LOGIN = '#/paths/~1platform~1auth~1login/post/responses';

let cliente: Client;
let doc1: UsuarioDeTest;
let doc2Desactivado: UsuarioDeTest;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  ({ doc1, doc2Desactivado } = await crearUsuariosDeAuth(cliente, ESPACIO_DE_IDS));
});

afterAll(async () => {
  await limpiarUsuarios(cliente, [doc1.id, doc2Desactivado.id]);
  await cliente.end();
});

const sesionesDeLosUsuarios = () => contarSesiones(cliente, [doc1.id, doc2Desactivado.id]);

function appDeLogin(logger = loggerEnMemoria()) {
  return appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS,
    tokens: tokensFijos(TOKEN_EMITIDO),
    reloj: relojFijo(),
    registrar: logger.registrar,
  });
}

describe('POST /platform/auth/login', () => {
  it('crea una sesión con token_hash y responde 204 con cookie HttpOnly Secure SameSite=Strict distinta de la previa cuando doc1 envía credenciales correctas [US-211 AC-1]', async () => {
    const antes = await contarSesiones(cliente, [doc1.id]);

    const respuesta = await request(appDeLogin())
      .post('/platform/auth/login')
      .set('Cookie', `oncolens_session=${COOKIE_PREVIA}`)
      .send({ email: doc1.email, password: doc1.password });

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    const cookie = cookiesEmitidas(respuesta).find((valor) =>
      valor.startsWith('oncolens_session='),
    );
    expect(cookie).toBeDefined();
    const [par, ...atributos] = (cookie ?? '').split('; ');
    const token = (par ?? '').slice('oncolens_session='.length);
    expect(token).toBe(TOKEN_EMITIDO);
    expect(token).not.toBe(COOKIE_PREVIA);
    expect(atributos).toEqual(
      expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']),
    );
    expect(atributos.some((atributo) => atributo.toLowerCase().startsWith('domain='))).toBe(false);

    const filas = (await cliente.query('SELECT * FROM auth.session WHERE user_id = $1', [doc1.id]))
      .rows as Record<string, unknown>[];
    expect(filas).toHaveLength(antes + 1);
    const fila = filas.find(
      (candidata) => candidata['token_hash'] !== null && !candidata['revoked'],
    );
    expect(fila?.['token_hash']).toBe(createHash('sha256').update(TOKEN_EMITIDO).digest('hex'));
    expect((fila?.['expires_at'] as Date).toISOString()).toBe('2026-10-16T20:00:00.000Z');
    // Nunca se guarda la IP ni el user agent reales en el S1 (decisión 2026-10-20): ambas columnas quedan en null.
    expect(fila?.['ip_address']).toBeNull();
    expect(fila?.['user_agent']).toBeNull();
    for (const valor of Object.values(fila ?? {})) {
      expect(String(valor)).not.toContain(TOKEN_EMITIDO);
    }
  });
});

describe('POST /platform/auth/login con credenciales rechazadas', () => {
  it.each([
    [
      'la contraseña es incorrecta',
      () => ({ email: doc1.email, password: 'contrasena-incorrecta' }),
    ],
    [
      'el correo no existe',
      () => ({ email: `inexistente.${ESPACIO_DE_IDS}@test.local`, password: CONTRASENA_DOC1 }),
    ],
    [
      'la cuenta está desactivada',
      () => ({ email: doc2Desactivado.email, password: doc2Desactivado.password }),
    ],
  ])(
    'responde 401 CREDENCIALES_INVALIDAS con el mismo cuerpo y sin crear sesión cuando %s [US-211 AC-2]',
    async (_caso, credenciales) => {
      const antes = await sesionesDeLosUsuarios();

      const respuesta = await request(appDeLogin())
        .post('/platform/auth/login')
        .send(credenciales());

      expect(respuesta.status).toBe(401);
      expect(respuesta.headers['set-cookie']).toBeUndefined();
      assertMatchesSpec('clinical-api', `${PUNTERO_LOGIN}/401`, respuesta.body);
      expect(respuesta.body).toMatchObject({
        error: 'CREDENCIALES_INVALIDAS',
        message: 'Las credenciales no son válidas.',
      });
      expect(JSON.stringify(respuesta.body)).not.toContain('test.local');
      expect(await sesionesDeLosUsuarios()).toBe(antes);
    },
  );
});

describe('POST /platform/auth/login con cuerpo inválido', () => {
  it.each([
    ['falta la contraseña', { email: 'doc1@test.local' }],
    ['el correo no es un correo', { email: 'no-es-correo', password: 'x' }],
    ['hay propiedades desconocidas', { email: 'a@test.local', password: 'x', extra: 1 }],
  ])('responde 422 CUERPO_INVALIDO sin crear sesión cuando %s', async (_caso, cuerpo) => {
    const antes = await sesionesDeLosUsuarios();

    const respuesta = await request(appDeLogin()).post('/platform/auth/login').send(cuerpo);

    expect(respuesta.status).toBe(422);
    assertMatchesSpec('clinical-api', `${PUNTERO_LOGIN}/422`, respuesta.body);
    expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
    expect(await sesionesDeLosUsuarios()).toBe(antes);
  });

  it('responde 422 CUERPO_INVALIDO sin eco del parser cuando el JSON viene malformado', async () => {
    const respuesta = await request(appDeLogin())
      .post('/platform/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "x@test.local", "password": ');

    expect(respuesta.status).toBe(422);
    assertMatchesSpec('clinical-api', `${PUNTERO_LOGIN}/422`, respuesta.body);
    expect(JSON.stringify(respuesta.body)).not.toContain('JSON');
  });
});
