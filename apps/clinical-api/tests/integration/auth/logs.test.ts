import request from 'supertest';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { crearRegistrador } from '../../../src/infrastructure/logger.js';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import {
  cookiesEmitidas,
  crearUsuariosDeAuth,
  limpiarUsuarios,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 103;
const TOKEN_EMITIDO = 'tokenSinteticoDeSesionLogsBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const CONTRASENA_INCORRECTA = 'SINT-contrasena-incorrecta-que-no-debe-registrarse';

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

describe('logs de clinical-api durante el login', () => {
  it('no contiene la contraseña ni el token en los logs de clinical-api cuando se ejecutan los logins de AC-1 y AC-2 [US-211 AC-6]', async () => {
    const lineas: string[] = [];
    const app = appConAuth({
      cliente,
      espacio: ESPACIO_DE_IDS,
      tokens: tokensFijos(TOKEN_EMITIDO),
      reloj: relojFijo(),
      registrar: crearRegistrador((linea) => lineas.push(linea)),
    });
    const intentos = [
      { email: doc1.email, password: doc1.password },
      { email: doc1.email, password: CONTRASENA_INCORRECTA },
      { email: `inexistente.${ESPACIO_DE_IDS}@test.local`, password: CONTRASENA_INCORRECTA },
      { email: doc2Desactivado.email, password: doc2Desactivado.password },
    ];

    const respuestas = [];
    for (const intento of intentos) {
      respuestas.push(await request(app).post('/platform/auth/login').send(intento));
    }

    expect(respuestas.map((respuesta) => respuesta.status)).toEqual([204, 401, 401, 401]);
    const cookie = cookiesEmitidas(respuestas[0] ?? { headers: {} })[0] ?? '';
    expect(cookie).toContain(TOKEN_EMITIDO);
    expect(lineas.length).toBeGreaterThanOrEqual(intentos.length);
    const texto = lineas.join('\n');
    for (const secreto of [
      doc1.password,
      doc2Desactivado.password,
      CONTRASENA_INCORRECTA,
      TOKEN_EMITIDO,
    ]) {
      expect(texto).not.toContain(secreto);
    }
    // El login registra solo event, resultado y traceId: ni correo ni cuerpo.
    expect(texto).not.toContain('test.local');
    for (const linea of lineas) {
      expect(Object.keys(JSON.parse(linea) as object).sort()).toEqual([
        'event',
        'resultado',
        'traceId',
      ]);
    }
  });
});
