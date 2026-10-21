import type { Client } from 'pg';
import type { Argon2Config } from '../../src/config/index.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import {
  crearRegistrador,
  type LineaDeLog,
  type Registrar,
} from '../../src/infrastructure/logger.js';
import type { GeneradorDeToken } from '../../src/modules/auth/auth.service.js';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';
import {
  generadorDeIds,
  INSTANTE_FIJO,
  insertar,
  type GeneradorDeIds,
} from './filas-sinteticas.js';

/**
 * Soporte de los tests de sesión (US-211): usuarios SINTÉTICOS `@test.local` (RN-13, RN-14), reloj y generador de
 * token fijos, y un logger capturable en memoria. Las contraseñas vienen del entorno de test (nunca del repo, RN-14):
 * si falta la variable, el test falla nombrándola.
 */

export type VariableDeContrasenaDeTest = 'TEST_DOC1_PASSWORD' | 'TEST_DOC2_PASSWORD';

/** Contraseña de test desde el entorno; sin variable, falla nombrándola (nunca un valor por defecto en el repo). */
export function contrasenaDeTest(variable: VariableDeContrasenaDeTest): string {
  if (!/^TEST_DOC\d_PASSWORD$/.test(variable)) {
    throw new Error(
      `${variable} no es una variable de contraseña de test (solo TEST_DOC*_PASSWORD)`,
    );
  }
  const valor = process.env[variable];
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno de test ${variable} (perfil test, L1D-165)`);
  }
  return valor;
}

/** Costes bajos de Argon2id para la CI (el `.env` de test los baja, design Riesgos); los usa el hasher del servicio también. */
export const ARGON2_DE_PRUEBA: Argon2Config = { memoryCostKib: 8, timeCost: 1, parallelism: 1 };

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
  const passwordHash = await createPasswordHasher(ARGON2_DE_PRUEBA).hash(opciones.password);
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

/**
 * Los dos usuarios que usan los tests de sesión: `doc1` activo y `doc2` desactivado (D7: lo crea el test, no el
 * seed). El correo lleva el espacio del archivo porque los archivos comparten base y corren en paralelo.
 */
export async function crearUsuariosDeAuth(cliente: Client, espacio: number) {
  const ids = generadorDeIds(espacio);
  const rolId = await asegurarRol(cliente, ids, 'doctor');
  const doc1 = await insertarUsuario(cliente, ids, {
    email: `doc1.${espacio}@test.local`,
    password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
    rolId,
  });
  const doc2Desactivado = await insertarUsuario(cliente, ids, {
    email: `doc2.${espacio}@test.local`,
    password: contrasenaDeTest('TEST_DOC2_PASSWORD'),
    rolId,
    estado: 'desactivado',
  });
  return { ids, doc1, doc2Desactivado };
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
    ip_address: null,
    user_agent: null,
    revoked: fila.revoked ?? false,
    created_at: INSTANTE_FIJO,
  });
}

/** Sesiones de los usuarios dados (los archivos de test comparten base: nunca se cuenta la tabla entera). */
export async function contarSesiones(cliente: Client, userIds: string[]): Promise<number> {
  const resultado = await cliente.query(
    'SELECT count(*)::int AS n FROM auth.session WHERE user_id = ANY($1::uuid[])',
    [userIds],
  );
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

/**
 * Logger que pasa por `crearRegistrador` (redacción y serialización de producción) y guarda las líneas ya serializadas:
 * así las pruebas de "sin PHI" y de "JSON válido con traceId" ven lo que realmente se escribiría (US-037).
 */
export function loggerJsonEnMemoria(
  opciones: { camposSensiblesExtra?: readonly string[] } = {},
): LoggerEnMemoria & {
  crudas: string[];
} {
  const crudas: string[] = [];
  const lineas: LineaDeLog[] = [];
  const registrar = crearRegistrador((texto) => {
    crudas.push(texto);
    lineas.push(JSON.parse(texto) as LineaDeLog);
  }, opciones);
  return { registrar, lineas, crudas, texto: () => crudas.join('\n') };
}

/** Generador de traceId determinista con el formato del contrato (`req_xxxxxxxx`). */
export function traceIdsFijos(): () => string {
  let n = 0;
  return () => `req_${String(++n).padStart(8, '0')}`;
}
