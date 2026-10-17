import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readAppEnv, readDatabaseConfig } from '../../src/config.js';
import { crearPool } from '../../src/infrastructure/database.js';

const ARCHIVOS: Record<string, string> = {
  '/run/secrets/pg_clinical_api_password': 'contrasena-ficticia\n',
  '/run/secrets/pg_ca.crt': '-----BEGIN CERTIFICATE-----\nficticio\n-----END CERTIFICATE-----\n',
  '/run/secrets/vacio': '',
};
const leer = (ruta: string): string => {
  const contenido = ARCHIVOS[ruta];
  if (contenido === undefined) throw new Error(`ENOENT ${ruta}`);
  return contenido;
};
const ENTORNO_VALIDO = {
  CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
  PG_CLINICAL_API_PASSWORD_FILE: '/run/secrets/pg_clinical_api_password',
  CLINICAL_DATABASE_CA_FILE: '/run/secrets/pg_ca.crt',
};

function variableQueFalla(env: NodeJS.ProcessEnv): { variable: string; mensaje: string } {
  try {
    readDatabaseConfig(env, leer);
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) {
      return { variable: error.variable, mensaje: error.message };
    }
    throw error;
  }
  throw new Error('debía fallar');
}

describe('readDatabaseConfig', () => {
  it('compone host, puerto, base, usuario, contraseña del archivo y CA desde la URL sin credenciales', () => {
    expect(readDatabaseConfig(ENTORNO_VALIDO, leer)).toEqual({
      host: 'postgres',
      port: 5432,
      database: 'oncolens',
      user: 'clinical_api',
      password: 'contrasena-ficticia',
      ca: '-----BEGIN CERTIFICATE-----\nficticio\n-----END CERTIFICATE-----',
    });
  });

  it.each(['CLINICAL_DATABASE_URL', 'PG_CLINICAL_API_PASSWORD_FILE', 'CLINICAL_DATABASE_CA_FILE'])(
    'falla nombrando %s cuando falta',
    (variable) => {
      const env = { ...ENTORNO_VALIDO, [variable]: '' };

      expect(variableQueFalla(env).variable).toBe(variable);
    },
  );

  it('rechaza una URL con contraseña sin repetir la contraseña en el mensaje', () => {
    const falla = variableQueFalla({
      ...ENTORNO_VALIDO,
      CLINICAL_DATABASE_URL: 'postgresql://clinical_api:SECRETO-EN-URL@postgres:5432/oncolens',
    });

    expect(falla.variable).toBe('CLINICAL_DATABASE_URL');
    expect(falla.mensaje).not.toContain('SECRETO-EN-URL');
  });

  it('nombra la variable y no la ruta cuando el archivo no existe o está vacío', () => {
    const noExiste = variableQueFalla({
      ...ENTORNO_VALIDO,
      PG_CLINICAL_API_PASSWORD_FILE: '/run/secrets/no-existe',
    });
    const vacio = variableQueFalla({
      ...ENTORNO_VALIDO,
      CLINICAL_DATABASE_CA_FILE: '/run/secrets/vacio',
    });

    expect(noExiste).toMatchObject({ variable: 'PG_CLINICAL_API_PASSWORD_FILE' });
    expect(noExiste.mensaje).not.toContain('/run/secrets');
    expect(vacio.variable).toBe('CLINICAL_DATABASE_CA_FILE');
  });

  it.each(['no-es-url', 'mysql://u@h/db', 'postgresql://postgres:5432/oncolens'])(
    'rechaza la URL %s',
    (url) => {
      expect(variableQueFalla({ ...ENTORNO_VALIDO, CLINICAL_DATABASE_URL: url }).variable).toBe(
        'CLINICAL_DATABASE_URL',
      );
    },
  );
});

describe('readAppEnv', () => {
  it('devuelve APP_ENV y falla nombrándola cuando falta', () => {
    expect(readAppEnv({ APP_ENV: 'local' })).toBe('local');
    expect(() => readAppEnv({})).toThrow(/APP_ENV/);
  });
});

describe('crearPool', () => {
  it('verifica siempre el certificado del servidor contra la CA configurada', async () => {
    const pool = crearPool(readDatabaseConfig(ENTORNO_VALIDO, leer));

    expect(pool.options.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((pool.options.ssl as { ca: string }).ca).toContain('BEGIN CERTIFICATE');
    await pool.end();
  });
});
