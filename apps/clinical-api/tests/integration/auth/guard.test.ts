import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Client } from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  CONTRASENA_DOC1,
  insertarSesion,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 102;
const RAG_URL = 'http://rag-orchestrator:8000/rag/query';
const PUNTERO_NO_AUTENTICADO = '#/components/responses/NoAutenticado';
const AHORA = '2026-10-16T12:00:00.000Z';
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');

// Contadores del borde: cuántas veces corrió el controlador y cuántas veces se llamó a rag-orchestrator.
let ejecuciones = 0;
let llamadasARag = 0;
const esLoopback = (url: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
const servidor = setupServer(
  http.post(RAG_URL, () => {
    llamadasARag += 1;
    return HttpResponse.json({});
  }),
);

/** Ruta de prueba protegida: hace de `POST /platform/evidence-analyses` hasta que exista el gateway (L1D-103). */
function rutaProtegidaDePrueba(): Router {
  const ruta = Router();
  ruta.post('/evidence-analyses', express.json(), async (peticion, respuesta) => {
    ejecuciones += 1;
    await fetch(RAG_URL, { method: 'POST' });
    respuesta.status(200).json({ sesion: peticion.sesion });
  });
  return ruta;
}

let cliente: Client;
let doc1: UsuarioDeTest;
let doc2Desactivado: UsuarioDeTest;
let ids: ReturnType<typeof generadorDeIds>;

beforeAll(async () => {
  servidor.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      if (frame.protocol === 'http' && esLoopback((frame.data as { request: Request }).request.url))
        frame.passthrough();
      else defaults.error();
    },
  });
  cliente = await conectar(urlBase);
  ids = generadorDeIds(ESPACIO_DE_IDS);
  const rolDoctor = await asegurarRol(cliente, ids, 'doctor');
  doc1 = await insertarUsuario(cliente, ids, {
    email: `doc1.${ESPACIO_DE_IDS}@test.local`,
    password: CONTRASENA_DOC1,
    rolId: rolDoctor,
  });
  doc2Desactivado = await insertarUsuario(cliente, ids, {
    email: `doc2.${ESPACIO_DE_IDS}@test.local`,
    password: CONTRASENA_DOC1,
    rolId: rolDoctor,
    estado: 'desactivado',
  });
});

beforeEach(() => {
  ejecuciones = 0;
  llamadasARag = 0;
});
afterEach(() => servidor.resetHandlers());
afterAll(async () => {
  servidor.close();
  await limpiarUsuarios(cliente, [doc1.id, doc2Desactivado.id]);
  await cliente.end();
});

function appProtegida() {
  return appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS,
    tokens: tokensFijos('no-se-usa'),
    reloj: relojFijo(AHORA),
    registrar: loggerEnMemoria().registrar,
    rutasProtegidas: [rutaProtegidaDePrueba()],
  });
}

function esperarNoAutenticado(respuesta: request.Response) {
  expect(respuesta.status).toBe(401);
  assertMatchesSpec('clinical-api', PUNTERO_NO_AUTENTICADO, respuesta.body);
  expect(respuesta.body.error).toBe('NO_AUTENTICADO');
  expect(ejecuciones).toBe(0);
  expect(llamadasARag).toBe(0);
}

describe('guard de sesión de /platform/*', () => {
  it('responde 401 NO_AUTENTICADO antes del controlador y sin llamar a rag-orchestrator cuando el análisis llega sin cookie o con una cookie desconocida [US-211 AC-3]', async () => {
    const sinCookie = await request(appProtegida()).post('/platform/evidence-analyses').send({});
    esperarNoAutenticado(sinCookie);

    const desconocida = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Cookie', 'oncolens_session=tokenAleatorioQueNoEstaEnLaBase')
      .send({});
    esperarNoAutenticado(desconocida);
  });

  it('responde 401 NO_AUTENTICADO cuando la sesión existe pero su expires_at ya pasó [US-211 AC-3]', async () => {
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe('tokenDeSesionCaducada'),
      expiresAt: '2026-10-16T11:59:59.000Z',
    });

    const respuesta = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Cookie', 'oncolens_session=tokenDeSesionCaducada')
      .send({});

    esperarNoAutenticado(respuesta);
  });

  it('responde 401 antes de validar el cuerpo cuando no hay sesión y el JSON viene malformado', async () => {
    const respuesta = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Content-Type', 'application/json')
      .send('{"malformado":');

    esperarNoAutenticado(respuesta);
  });

  it('responde 401 cuando expires_at coincide exactamente con el reloj', async () => {
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe('tokenQueCaducaAhora'),
      expiresAt: AHORA,
    });

    const respuesta = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Cookie', 'oncolens_session=tokenQueCaducaAhora')
      .send({});

    esperarNoAutenticado(respuesta);
  });

  it.each([
    ['la sesión fue revocada', 'tokenRevocado', () => doc1, true],
    [
      'la cuenta del usuario ya no está activa',
      'tokenDeCuentaDesactivada',
      () => doc2Desactivado,
      false,
    ],
  ])('responde 401 cuando %s', async (_caso, token, usuario, revoked) => {
    await insertarSesion(cliente, ids, {
      userId: usuario().id,
      tokenHash: hashDe(token),
      expiresAt: '2026-10-16T20:00:00.000Z',
      revoked,
    });

    const respuesta = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Cookie', `oncolens_session=${token}`)
      .send({});

    esperarNoAutenticado(respuesta);
  });

  it('deja pasar al controlador con userId y rol adjuntos cuando la sesión está vigente', async () => {
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe('tokenVigente'),
      expiresAt: '2026-10-16T20:00:00.000Z',
    });

    const respuesta = await request(appProtegida())
      .post('/platform/evidence-analyses')
      .set('Cookie', 'otraCookie=1; oncolens_session=tokenVigente; tema=oscuro')
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.sesion).toEqual({ userId: doc1.id, rol: 'doctor' });
    expect(ejecuciones).toBe(1);
  });
});
