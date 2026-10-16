import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leerConfiguracionArnes } from '../support/db.js';
import { generadorDeIds } from '../support/filas-sinteticas.js';
import {
  ErrorArnes,
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
});

// Paridad por COMPORTAMIENTO con scripts/lib/pg-test-prefix.sh: la misma tabla de casos, el mismo veredicto.
describe('validarPrefijoTestDb frente a scripts/lib/pg-test-prefix.sh', () => {
  const SCRIPT = fileURLToPath(new URL('../../../../scripts/lib/pg-test-prefix.sh', import.meta.url));
  const CASOS: Array<[string, string]> = [
    ['.*', 'oncolens'],
    ['Ab', 'oncolens'],
    ['oncolens', 'oncolens'],
    ['post', 'oncolens'],
    ['template', 'oncolens'],
    ['templ', 'oncolens'],
    ['postgres_x', 'oncolens'],
    ['oltest_', 'oncolens'],
    ['oltest_;DROP', 'oncolens'],
  ];

  const veredictoDelScript = (prefijo: string, baseClinica: string): boolean =>
    spawnSync('bash', ['-c', 'source "$0"; validar_prefijo_test_db "$1" "$2"', SCRIPT, prefijo, baseClinica], { encoding: 'utf8' })
      .status === 0;
  const veredictoDelArnes = (prefijo: string, baseClinica: string): boolean => {
    try {
      validarPrefijoTestDb(prefijo, baseClinica);
      return true;
    } catch {
      return false;
    }
  };

  it.each(CASOS)('da el mismo veredicto que el script cuando el prefijo es %j y la base clínica %j', (prefijo, baseClinica) => {
    expect(veredictoDelArnes(prefijo, baseClinica)).toBe(veredictoDelScript(prefijo, baseClinica));
  });

  it('acepta solo oltest_ de la tabla de casos', () => {
    expect(CASOS.filter(([prefijo, base]) => veredictoDelScript(prefijo, base)).map(([prefijo]) => prefijo)).toEqual(['oltest_']);
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

describe('generadorDeIds', () => {
  it('no comparte ids cuando los espacios son distintos', () => {
    const a = generadorDeIds(1);
    const b = generadorDeIds(2);
    const ids = [a(), a(), a(), b(), b(), b()];

    expect(new Set(ids).size).toBe(6);
  });

  it('repite la misma secuencia cuando el espacio es el mismo (determinismo)', () => {
    expect([generadorDeIds(3)(), generadorDeIds(3)()]).toEqual([generadorDeIds(3)(), generadorDeIds(3)()]);
  });
});
