import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type ClientConfig } from 'pg';
import { ErrorArnes, validarNombreBaseDeTest, validarPrefijoTestDb } from './prefijo-test-db.js';

/**
 * Arnés de PostgreSQL real de test (US-038 D4, [S1 resp. 14b]). Lo reutilizan US-213 y toda la integración de
 * clinical-api. Entra como `oncolens_test_admin` (solo CREATEDB; el superusuario no tiene regla de red), crea una base
 * `${PG_TEST_DB_PREFIX}<id>` por ejecución, aplica `prisma migrate deploy` y la elimina al terminar.
 * No registra filas, valores ni credenciales: solo nombres de variables y de bases.
 */

const RAIZ_APP = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RAIZ_REPO = resolve(RAIZ_APP, '../..');
const CORPUS_SCHEMA_GRANTS = resolve(
  RAIZ_REPO,
  'infra/docker/postgres/sql/corpus-schema-grants.sql',
);
const BASE_DE_MANTENIMIENTO = 'postgres';
const BASE_CLINICA_POR_DEFECTO = 'oncolens';

export interface ConfiguracionArnes {
  /** URL del rol oncolens_test_admin sobre la base de mantenimiento, con sslmode=require. */
  readonly urlAdministracion: URL;
  readonly prefijo: string;
  readonly baseClinica: string;
}

export interface BaseDeTest {
  readonly nombre: string;
  /** URL de la base recién migrada (misma credencial, otra base). Contiene la contraseña: no se imprime. */
  readonly url: string;
  readonly destruir: () => Promise<void>;
}

function exigirVariable(env: NodeJS.ProcessEnv, nombre: string): string {
  const valor = env[nombre];
  if (!valor)
    throw new ErrorArnes(
      `falta la variable ${nombre} (perfil test de US-035; ver docs/operations/claves.md)`,
    );
  return valor;
}

/** Lee y valida el entorno. Aborta sin conectar si el prefijo o la URL no cumplen. */
export function leerConfiguracionArnes(env: NodeJS.ProcessEnv): ConfiguracionArnes {
  const baseClinica = env.POSTGRES_DB || BASE_CLINICA_POR_DEFECTO;
  const prefijo = exigirVariable(env, 'PG_TEST_DB_PREFIX');
  validarPrefijoTestDb(prefijo, baseClinica);

  let urlAdministracion: URL;
  try {
    urlAdministracion = new URL(exigirVariable(env, 'TEST_DATABASE_URL'));
  } catch (error) {
    if (error instanceof ErrorArnes) throw error;
    throw new ErrorArnes('TEST_DATABASE_URL no es una URL válida');
  }
  if (urlAdministracion.searchParams.get('sslmode') !== 'require') {
    throw new ErrorArnes('TEST_DATABASE_URL debe llevar sslmode=require (SEG-08)');
  }
  return { urlAdministracion, prefijo, baseClinica };
}

function urlDeBase(urlAdministracion: URL, base: string): URL {
  const url = new URL(urlAdministracion);
  url.pathname = `/${base}`;
  return url;
}

/** `require` de libpq: TLS obligatorio, sin verificar la CA (la CA local la verifica `verify-full`, S5/S6). */
function configuracionCliente(url: URL): ClientConfig {
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: { rejectUnauthorized: false },
  };
}

export async function conectar(url: URL | string): Promise<Client> {
  const cliente = new Client(configuracionCliente(new URL(url)));
  await cliente.connect();
  return cliente;
}

export interface ResultadoPrisma {
  readonly codigo: number | null;
  readonly salida: string;
}

/** Ejecuta la CLI de Prisma contra `url`. La salida se devuelve sin la contraseña. */
export function ejecutarPrisma(url: URL | string, argumentos: string[]): ResultadoPrisma {
  const destino = new URL(url);
  const resultado = spawnSync('npx', ['--no-install', 'prisma', ...argumentos], {
    cwd: RAIZ_APP,
    env: { ...process.env, DATABASE_URL: destino.toString() },
    encoding: 'utf8',
  });
  const bruta = `${resultado.stdout}\n${resultado.stderr}`;
  // La contraseña puede aparecer codificada (como en la URL) o decodificada.
  const salida = [destino.password, decodeURIComponent(destino.password)].reduce(
    (texto, secreto) => (secreto ? texto.replaceAll(secreto, '***') : texto),
    bruta,
  );
  return { codigo: resultado.status, salida };
}

function aplicarMigraciones(url: URL): void {
  const resultado = ejecutarPrisma(url, ['migrate', 'deploy']);
  if (resultado.codigo !== 0)
    throw new ErrorArnes(`prisma migrate deploy falló:\n${resultado.salida}`);
}

/** Privilegios sobre `corpus` que aplica L1D-165 al inicializar el volumen; aquí, como dueño de la base de test. */
async function aplicarPrivilegiosDelCorpus(url: URL): Promise<void> {
  const cliente = await conectar(url);
  try {
    await cliente.query(readFileSync(CORPUS_SCHEMA_GRANTS, 'utf8'));
  } finally {
    await cliente.end();
  }
}

/**
 * Crea `${prefijo}${sufijo}`, la migra y devuelve cómo destruirla. El sufijo lo inyecta quien llama (generador de
 * ids del setup global): el arnés no usa aleatoriedad propia.
 */
export async function crearBaseDeTest(
  config: ConfiguracionArnes,
  sufijo: string,
): Promise<BaseDeTest> {
  const nombre = `${config.prefijo}${sufijo}`;
  validarNombreBaseDeTest(nombre, config.prefijo, config.baseClinica);

  const mantenimiento = await conectar(urlDeBase(config.urlAdministracion, BASE_DE_MANTENIMIENTO));
  try {
    await mantenimiento.query(`CREATE DATABASE "${nombre}"`);
  } finally {
    await mantenimiento.end();
  }

  const url = urlDeBase(config.urlAdministracion, nombre);
  const destruir = async (): Promise<void> => {
    validarNombreBaseDeTest(nombre, config.prefijo, config.baseClinica);
    const cliente = await conectar(urlDeBase(config.urlAdministracion, BASE_DE_MANTENIMIENTO));
    try {
      await cliente.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    } finally {
      await cliente.end();
    }
  };

  try {
    aplicarMigraciones(url);
    await aplicarPrivilegiosDelCorpus(url);
  } catch (error) {
    await destruir();
    throw error;
  }
  return { nombre, url: url.toString(), destruir };
}

/**
 * Ejecuta `cuerpo` dentro de una transacción que siempre se revierte: los tests que insertan filas quedan
 * independientes entre sí. Las sentencias que DEBEN fallar usan `esperarRechazo`, que protege la transacción con un
 * SAVEPOINT.
 */
export async function conTransaccionRevertida<T>(
  url: string,
  cuerpo: (cliente: Client) => Promise<T>,
): Promise<T> {
  const cliente = await conectar(url);
  try {
    await cliente.query('BEGIN');
    return await cuerpo(cliente);
  } finally {
    await cliente.query('ROLLBACK').catch(() => undefined);
    await cliente.end();
  }
}

/** Ejecuta una sentencia que PostgreSQL debe rechazar y devuelve el error; si no falla, el test falla. */
export async function esperarRechazo(
  cliente: Client,
  sql: string,
  parametros: unknown[] = [],
): Promise<{ message: string; code?: string; constraint?: string }> {
  await cliente.query('SAVEPOINT rechazo');
  try {
    await cliente.query(sql, parametros);
  } catch (error) {
    await cliente.query('ROLLBACK TO SAVEPOINT rechazo');
    return error as { message: string; code?: string; constraint?: string };
  }
  await cliente.query('RELEASE SAVEPOINT rechazo');
  throw new Error('la sentencia debía ser rechazada por la base y se ejecutó');
}
