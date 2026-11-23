import { afterEach, describe, expect, it } from 'vitest';
import { crearPool } from '../../src/infrastructure/database.js';

const CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  database: 'oncolens',
  user: 'clinical_api',
  password: 'sin-uso',
  ca: 'ca-de-prueba',
};
const pools: ReturnType<typeof crearPool>[] = [];
afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

const sslDe = (servername?: string) => {
  const pool = crearPool(CONFIG, () => undefined, servername === undefined ? {} : { servername });
  pools.push(pool);
  return (pool as unknown as { options: { ssl: Record<string, unknown> } }).options.ssl;
};

describe('crearPool', () => {
  it('verifica el certificado contra la CA y no fija servername cuando no se indica (SEG-08)', () => {
    expect(sslDe()).toEqual({ ca: 'ca-de-prueba', rejectUnauthorized: true });
  });

  it('fija servername y mantiene rejectUnauthorized en true cuando se indica el nombre del certificado', () => {
    expect(sslDe('postgres')).toEqual({
      ca: 'ca-de-prueba',
      rejectUnauthorized: true,
      servername: 'postgres',
    });
  });
});
