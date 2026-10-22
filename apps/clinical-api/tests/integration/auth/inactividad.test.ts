import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { appConAuth } from '../../support/app-auth.js';
import { conectar } from '../../support/db.js';
import { clienteVerificado, type Response } from '../../support/verificarProveedor.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  asegurarRol,
  contrasenaDeTest,
  insertarSesion,
  insertarUsuario,
  limpiarUsuarios,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1984;
const AHORA = '2026-10-16T12:00:00.000Z';
const VIGENTE_HASTA = '2026-10-16T20:00:00.000Z';
const PUNTERO_NO_AUTENTICADO = '#/components/responses/NoAutenticado';
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

/** Ruta protegida de prueba: hace de la ficha del paciente hasta que exista `GET /platform/patients/{id}`. */
function rutaProtegidaDePrueba(): Router {
  const ruta = Router();
  ruta.get('/ruta-protegida-de-prueba', (_peticion, respuesta) => {
    respuesta.status(200).json({ ok: true });
  });
  return ruta;
}

beforeAll(async () => {
  cliente = await conectar(urlBase);
  const rolId = await asegurarRol(cliente, ids, 'doctor');
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

const app = () =>
  appConAuth({
    cliente,
    espacio: ESPACIO_DE_IDS,
    tokens: tokensFijos('no-se-usa'),
    reloj: relojFijo(AHORA),
    registrar: loggerEnMemoria().registrar,
    rutasProtegidas: [rutaProtegidaDePrueba()],
  });

/** Sesión de doc1 cuya última actividad fue hace `minutos`; devuelve la cabecera `Cookie`. */
async function sesionInactivaDesdeHace(
  alias: string,
  minutos: number,
  expiresAt = VIGENTE_HASTA,
): Promise<string> {
  const token = `tokenSintetico${alias}`;
  const lastSeenAt = new Date(new Date(AHORA).getTime() - minutos * 60_000).toISOString();
  await insertarSesion(cliente, ids, {
    userId: doc1.id,
    tokenHash: hashDe(token),
    expiresAt,
    lastSeenAt,
  });
  return `oncolens_session=${token}`;
}

async function ultimaActividad(alias: string): Promise<string> {
  const fila = await cliente.query<{ last_seen_at: Date }>(
    'SELECT last_seen_at FROM auth.session WHERE token_hash = $1',
    [hashDe(`tokenSintetico${alias}`)],
  );
  return fila.rows[0]?.last_seen_at.toISOString() ?? '';
}

function pedirRutaProtegida(cookie: string) {
  return clienteVerificado(app(), RUTA_DE_MENTIRA).get(RUTA_DE_PRUEBA).set('Cookie', cookie);
}

function esperarNoAutenticado(respuesta: Response) {
  expect(respuesta.status).toBe(401);
  assertMatchesSpec('clinical-api', PUNTERO_NO_AUTENTICADO, respuesta.body);
  expect(respuesta.body.error).toBe('NO_AUTENTICADO');
}

describe('expiración de la sesión por inactividad y por TTL', () => {
  it('responde 401 con last_seen_at de hace 31 minutos o expires_at vencido y 200 actualizando last_seen_at con 29 minutos [US-044 AC-4]', async () => {
    const inactiva = await sesionInactivaDesdeHace('Inactiva31', 31);
    const caducada = await sesionInactivaDesdeHace('Caducada', 1, '2026-10-16T11:59:00.000Z');
    const activa = await sesionInactivaDesdeHace('Activa29', 29);

    esperarNoAutenticado(await pedirRutaProtegida(inactiva));
    esperarNoAutenticado(await pedirRutaProtegida(caducada));
    expect(await ultimaActividad('Caducada')).toBe('2026-10-16T11:59:00.000Z');
    const viva = await pedirRutaProtegida(activa);

    expect(viva.status).toBe(200);
    expect(await ultimaActividad('Activa29')).toBe(AHORA);
    expect(await ultimaActividad('Inactiva31')).toBe('2026-10-16T11:29:00.000Z');
  });

  it('responde 401 cuando han pasado exactamente SESSION_IDLE_MINUTES desde la última actividad', async () => {
    const enElLimite = await sesionInactivaDesdeHace('Limite30', 30);

    esperarNoAutenticado(await pedirRutaProtegida(enElLimite));
  });

  it('acepta la sesión sin escribir cuando la última actividad es más reciente que SESSION_TOUCH_SECONDS', async () => {
    const reciente = await sesionInactivaDesdeHace('Reciente', 0.5);

    const respuesta = await pedirRutaProtegida(reciente);

    expect(respuesta.status).toBe(200);
    expect(await ultimaActividad('Reciente')).toBe('2026-10-16T11:59:30.000Z');
  });
});
