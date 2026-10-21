import type { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { componerAplicacion } from '../../../src/composition.js';
import { crearGeneradorDeToken } from '../../../src/infrastructure/token.js';
import { conectar } from '../../support/db.js';
import { CONFIG_DE_SESION_DE_TEST, CONFIG_DE_TEST } from '../../support/app-auth.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  cookiesEmitidas,
  crearUsuariosDeAuth,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  traceIdsFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 106;

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

describe('composición de producción (componerAplicacion)', () => {
  it('responde al login real con 204 y una cookie de 43 caracteres base64url, y el guard la acepta, con el generador de token de producción', async () => {
    const logger = loggerEnMemoria();
    const app = componerAplicacion({
      db: cliente,
      auth: CONFIG_DE_TEST,
      sesion: CONFIG_DE_SESION_DE_TEST,
      reloj: relojFijo(),
      tokens: crearGeneradorDeToken(),
      ids: generadorDeIds(ESPACIO_DE_IDS + 1000),
      nuevoTraceId: traceIdsFijos(),
      registrar: logger.registrar,
    });

    const login = await request(app)
      .post('/platform/auth/login')
      .send({ email: doc1.email, password: doc1.password });
    const cookie = cookiesEmitidas(login)[0]?.split(';')[0] ?? '';
    const sinSesion = await request(app).get('/platform/cualquier-ruta');
    const conSesion = await request(app).get('/platform/cualquier-ruta').set('Cookie', cookie);

    expect(login.status).toBe(204);
    expect(cookie).toMatch(/^oncolens_session=[A-Za-z0-9_-]{43}$/);
    expect(sinSesion.status).toBe(401);
    // La sesión es válida: el guard la deja pasar y la ruta inexistente responde 404 (no 401).
    expect(conSesion.status).toBe(404);
  });
});
