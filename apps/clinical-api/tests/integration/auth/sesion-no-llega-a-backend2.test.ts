import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import evidenciaEjemplo from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import solicitudEjemplo from '../../../../../contracts/examples/evidence-analysis-request.json' with { type: 'json' };
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { rutasDelGateway } from '../../support/gateway.js';
import {
  asegurarRol,
  CONTRASENA_DOC1,
  cookiesEmitidas,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 104;
const RAG_URL = 'http://rag-orchestrator:8000/rag/query';
const TOKEN_EMITIDO = 'tokenSinteticoDeSesionAislamientoCCCCCCCCCCCCCCCCCCCC';

interface Capturada {
  headers: Headers;
  cuerpo: string;
}
const capturadas: Capturada[] = [];
const esLoopback = (url: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
const servidor = setupServer(
  http.post(RAG_URL, async ({ request: peticion }) => {
    capturadas.push({ headers: peticion.headers, cuerpo: await peticion.text() });
    return HttpResponse.json(evidenciaEjemplo);
  }),
);

let cliente: Client;
let doc1: UsuarioDeTest;

beforeAll(async () => {
  servidor.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      if (frame.protocol === 'http' && esLoopback((frame.data as { request: Request }).request.url))
        frame.passthrough();
      else defaults.error();
    },
  });
  cliente = await conectar(urlBase);
  const ids = generadorDeIds(ESPACIO_DE_IDS);
  doc1 = await insertarUsuario(cliente, ids, {
    email: `doc1.${ESPACIO_DE_IDS}@test.local`,
    password: CONTRASENA_DOC1,
    rolId: await asegurarRol(cliente, ids, 'doctor'),
  });
});

afterEach(() => {
  capturadas.length = 0;
});
afterAll(async () => {
  servidor.close();
  await limpiarUsuarios(cliente, [doc1.id]);
  await cliente.end();
});

describe('credencial de servicio hacia rag-orchestrator', () => {
  it('envía Authorization Bearer y ninguna cabecera Cookie ni el token hacia rag-orchestrator cuando se pide un análisis con la cookie del login [US-211 AC-5]', async () => {
    const app = appConAuth({
      cliente,
      espacio: ESPACIO_DE_IDS,
      tokens: tokensFijos(TOKEN_EMITIDO),
      reloj: relojFijo(),
      registrar: loggerEnMemoria().registrar,
      rutasProtegidas: rutasDelGateway(),
    });
    const login = await request(app)
      .post('/platform/auth/login')
      .send({ email: doc1.email, password: doc1.password });
    const cookieDeSesion = (cookiesEmitidas(login)[0] ?? '').split(';')[0] ?? '';

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieDeSesion)
      .send(solicitudEjemplo);

    expect(login.status).toBe(204);
    expect(cookieDeSesion).toBe(`oncolens_session=${TOKEN_EMITIDO}`);
    expect(respuesta.status).toBe(200);
    expect(capturadas).toHaveLength(1);
    const { headers, cuerpo } = capturadas[0] as Capturada;
    expect(headers.get('authorization')).toMatch(/^Bearer /);
    expect(headers.has('cookie')).toBe(false);
    const cabeceras = JSON.stringify([...headers.entries()]);
    expect(cabeceras).not.toContain(TOKEN_EMITIDO);
    expect(cuerpo).not.toContain(TOKEN_EMITIDO);
  });
});
