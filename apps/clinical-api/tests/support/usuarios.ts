import argon2 from 'argon2';
import type { Client } from 'pg';
import type { Clock } from '../../src/infrastructure/clock.js';
import type { LineaDeLog, Registrar } from '../../src/infrastructure/logger.js';
import type { GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { INSTANTE_FIJO, insertar, type GeneradorDeIds } from './filas-sinteticas.js';

/**
 * Soporte de los tests de sesión (US-211): usuarios SINTÉTICOS `@test.local` (RN-13, RN-14), reloj y generador de
 * token fijos, y un logger capturable en memoria. Las contraseñas vienen del entorno de test (nunca del repo); el
 * valor por defecto es un marcador sintético para correr sin perfil.
 */

export const CONTRASENA_DOC1 =
  process.env['SEED_DOCTOR_PASSWORD'] ?? 'SINT-doc1-contrasena-de-prueba';
export const CONTRASENA_DOC2 =
  process.env['TEST_DOC2_PASSWORD'] ?? 'SINT-doc2-contrasena-de-prueba';

// Costes bajos: el hash solo prepara filas de test; el servicio verifica con los parámetros de su configuración.
const PARAMETROS_DE_PRUEBA = { memoryCost: 8, timeCost: 1, parallelism: 1 } as const;

/** Cabeceras `Set-Cookie` de una respuesta de Supertest (siempre arreglo, vacío si no hay). */
export function cookiesEmitidas(respuesta: { headers: Record<string, unknown> }): string[] {
  return [respuesta.headers['set-cookie']].flat().filter((valor) => typeof valor === 'string');
}

export interface UsuarioDeTest {
  id: string;
  email: string;
  password: string;
}

/** Rol `doctor`/`admin` compartido entre archivos de test (el nombre es único en BD). */
export async function asegurarRol(
  cliente: Client,
  ids: GeneradorDeIds,
  nombre: 'doctor' | 'admin',
): Promise<string> {
  const resultado = await cliente.query(
    `INSERT INTO auth.role (id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
    [ids(), nombre, `Rol ${nombre} de test`],
  );
  return (resultado.rows[0] as { id: string }).id;
}

export interface OpcionesDeUsuario {
  email: string;
  password: string;
  rolId: string;
  estado?: 'activo' | 'desactivado' | 'pendiente' | 'rechazado';
}

export async function insertarUsuario(
  cliente: Client,
  ids: GeneradorDeIds,
  opciones: OpcionesDeUsuario,
): Promise<UsuarioDeTest> {
  const id = ids();
  const passwordHash = await argon2.hash(opciones.password, {
    type: argon2.argon2id,
    ...PARAMETROS_DE_PRUEBA,
  });
  await insertar(cliente, 'auth."user"', {
    id,
    email: opciones.email,
    password_hash: passwordHash,
    full_name: 'Usuario Sintetico',
    role_id: opciones.rolId,
    account_status: opciones.estado ?? 'activo',
    failed_login_count: 0,
    created_at: INSTANTE_FIJO,
    updated_at: INSTANTE_FIJO,
  });
  return { id, email: opciones.email, password: opciones.password };
}

export async function insertarSesion(
  cliente: Client,
  ids: GeneradorDeIds,
  fila: { userId: string; tokenHash: string; expiresAt: string; revoked?: boolean },
): Promise<void> {
  await insertar(cliente, 'auth.session', {
    id: ids(),
    user_id: fila.userId,
    token_hash: fila.tokenHash,
    expires_at: fila.expiresAt,
    last_seen_at: INSTANTE_FIJO,
    ip_address: '',
    user_agent: '',
    revoked: fila.revoked ?? false,
    created_at: INSTANTE_FIJO,
  });
}

export async function contarSesiones(cliente: Client, userId?: string): Promise<number> {
  const resultado =
    userId === undefined
      ? await cliente.query('SELECT count(*)::int AS n FROM auth.session')
      : await cliente.query('SELECT count(*)::int AS n FROM auth.session WHERE user_id = $1', [
          userId,
        ]);
  return (resultado.rows[0] as { n: number }).n;
}

/** Borra las filas de los usuarios dados (los archivos de test comparten base y no usan transacción). */
export async function limpiarUsuarios(cliente: Client, userIds: string[]): Promise<void> {
  await cliente.query('DELETE FROM auth.session WHERE user_id = ANY($1::uuid[])', [userIds]);
  await cliente.query('DELETE FROM auth."user" WHERE id = ANY($1::uuid[])', [userIds]);
}

/** Generador de token con valores fijos, en orden (determinista). */
export function tokensFijos(...valores: string[]): GeneradorDeToken {
  let indice = 0;
  return {
    nuevo: () => {
      const valor = valores[Math.min(indice, valores.length - 1)];
      indice += 1;
      if (valor === undefined) throw new Error('tokensFijos necesita al menos un valor');
      return valor;
    },
  };
}

export function relojFijo(instante: string = INSTANTE_FIJO): Clock {
  return { now: () => new Date(instante) };
}

export interface LoggerEnMemoria {
  registrar: Registrar;
  lineas: LineaDeLog[];
  /** Todas las líneas serializadas, para buscar secretos como subcadena. */
  texto(): string;
}

export function loggerEnMemoria(): LoggerEnMemoria {
  const lineas: LineaDeLog[] = [];
  return {
    registrar: (linea) => {
      lineas.push(linea);
    },
    lineas,
    texto: () => JSON.stringify(lineas),
  };
}

/** Generador de traceId determinista con el formato del contrato (`req_xxxxxxxx`). */
export function traceIdsFijos(): () => string {
  let n = 0;
  return () => `req_${String(++n).padStart(8, '0')}`;
}
