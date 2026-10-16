import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerConfiguracionArnes } from '../support/db.js';
import {
  ErrorArnes,
  PATRON_PREFIJO_TEST_DB,
  validarNombreBaseDeTest,
  validarPrefijoTestDb,
} from '../support/prefijo-test-db.js';

const URL_ADMIN = 'postgresql://oncolens_test_admin:marcador@127.0.0.1:55432/postgres?sslmode=require';

describe('validarPrefijoTestDb', () => {
  it.each([
    ['.*', 'oncolens'],
    ['Ab', 'oncolens'],
    ['oncolens', 'oncolens'],
    ['post', 'oncolens'],
    ['template', 'oncolens'],
    ['templ', 'oncolens'],
  ])('aborta nombrando PG_TEST_DB_PREFIX cuando el prefijo %j es inválido o casa con una base reservada', (prefijo, baseClinica) => {
    expect(() => validarPrefijoTestDb(prefijo, baseClinica)).toThrow(/PG_TEST_DB_PREFIX/);
  });

  it('acepta el prefijo por defecto oltest_ cuando no casa con ninguna base reservada', () => {
    expect(() => validarPrefijoTestDb('oltest_', 'oncolens')).not.toThrow();
  });

  it('usa la misma regex que scripts/lib/pg-test-prefix.sh cuando se compara con el script', () => {
    const script = readFileSync(new URL('../../../../scripts/lib/pg-test-prefix.sh', import.meta.url), 'utf8');
    const patron = /PATRON_PREFIJO_TEST_DB='([^']+)'/.exec(script)?.[1];

    expect(patron).toBe(PATRON_PREFIJO_TEST_DB.source);
  });
});

describe('validarNombreBaseDeTest', () => {
  it('acepta el nombre que empieza por el prefijo y añade un sufijo', () => {
    expect(() => validarNombreBaseDeTest('oltest_ab12cd', 'oltest_', 'oncolens')).not.toThrow();
  });

  it.each(['oncolens', 'postgres', 'template0', 'otra_base', 'oltest_', 'oltest_A;DROP'])(
    'aborta antes de crear o borrar cuando el nombre %j no es una base de test',
    (nombre) => {
      expect(() => validarNombreBaseDeTest(nombre, 'oltest_', 'oncolens')).toThrow(ErrorArnes);
    },
  );
});

describe('leerConfiguracionArnes', () => {
  it('nombra TEST_DATABASE_URL sin imprimir su valor cuando falta', () => {
    expect(() => leerConfiguracionArnes({ PG_TEST_DB_PREFIX: 'oltest_' })).toThrow('TEST_DATABASE_URL');
  });

  it('exige sslmode=require en TEST_DATABASE_URL', () => {
    const env = { PG_TEST_DB_PREFIX: 'oltest_', TEST_DATABASE_URL: URL_ADMIN.replace('require', 'disable') };

    expect(() => leerConfiguracionArnes(env)).toThrow('sslmode=require');
  });

  it('aborta sin leer la URL cuando el prefijo casa con POSTGRES_DB', () => {
    const env = { PG_TEST_DB_PREFIX: 'oncolens', POSTGRES_DB: 'oncolens', TEST_DATABASE_URL: URL_ADMIN };

    expect(() => leerConfiguracionArnes(env)).toThrow('PG_TEST_DB_PREFIX');
  });

  it('devuelve la configuración cuando el entorno es válido', () => {
    const config = leerConfiguracionArnes({ PG_TEST_DB_PREFIX: 'oltest_', TEST_DATABASE_URL: URL_ADMIN });

    expect(config.prefijo).toBe('oltest_');
    expect(config.baseClinica).toBe('oncolens');
  });
});
