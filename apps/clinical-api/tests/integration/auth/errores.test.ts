import type { Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { createApp } from '../../../src/app.js';
import type { AuthRepository } from '../../../src/modules/auth/auth.repository.js';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import {
  crearUsuariosDeAuth,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 105;
const DETALLE_INTERNO = 'detalle-interno-secreto password=hunter2 /ruta/interna.ts';

const repoQueLanza: AuthRepository = {
  buscarUsuarioPorCorreo: () => Promise.reject(new Error(DETALLE_INTERNO)),
  crearSesion: () => Promise.reject(new Error(DETALLE_INTERNO)),
  buscarSesionPorTokenHash: () => Promise.reject(new Error(DETALLE_INTERNO)),
};

let cliente: Client;
let doc1: UsuarioDeTest;
let doc2Desactivado: UsuarioDeTest;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  ({ doc1, doc2Desactivado } = await crearUsuariosDeAuth(cliente, ESPACIO_DE_IDS));
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await limpiarUsuarios(cliente, [doc1.id, doc2Desactivado.id]);
  await cliente.end();
});

describe('manejador final de errores', () => {
  it.each(['production', 'development', 'test'])(
    'responde 500 JSON fijo sin stack ni mensaje interno y registra solo event y traceId cuando el repository lanza (NODE_ENV=%s)',
    async (entorno) => {
      vi.stubEnv('NODE_ENV', entorno);
      const logger = loggerEnMemoria();
      const app = appConAuth({
        cliente,
        espacio: ESPACIO_DE_IDS,
        tokens: tokensFijos('t'),
        reloj: relojFijo(),
        registrar: logger.registrar,
        repo: repoQueLanza,
      });

      const login = await request(app)
        .post('/platform/auth/login')
        .send({ email: doc1.email, password: doc1.password });
      const guard = await request(app)
        .post('/platform/otra-ruta')
        .set('Cookie', 'oncolens_session=cualquiera');

      for (const respuesta of [login, guard]) {
        expect(respuesta.status).toBe(500);
        expect(respuesta.headers['content-type']).toMatch(/application\/json/);
        expect(Object.keys(respuesta.body as object).sort()).toEqual([
          'error',
          'message',
          'traceId',
        ]);
        expect(respuesta.text).not.toMatch(/hunter2|interna|at .*\(|stack/i);
      }
      const registradas = logger.lineas.filter((linea) => linea['event'] === 'error.no_controlado');
      expect(registradas).toHaveLength(2);
      for (const linea of registradas) {
        expect(Object.keys(linea).sort()).toEqual(['event', 'traceId']);
      }
      expect(logger.texto()).not.toMatch(/hunter2|interna/);
    },
  );
});

describe('AppDependencies', () => {
  it('no admite rutasProtegidas sin el módulo de autenticación (el guard) [tipos]', () => {
    // Solo se comprueba en tiempo de compilación (`tsc --noEmit`): la función no se ejecuta.
    const construccionesInvalidas = (): void => {
      // @ts-expect-error `plataforma` exige `auth`: no se pueden montar rutas protegidas sin guard
      createApp({ plataforma: { rutasProtegidas: [] } });
      // @ts-expect-error `rutasProtegidas` ya no es una dependencia de nivel superior
      createApp({ rutasProtegidas: [] });
    };
    expect(construccionesInvalidas).toBeTypeOf('function');
  });
});
