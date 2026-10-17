import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';

const PARAMETROS = { memoryCostKib: 8, timeCost: 1, parallelism: 1 };

describe('createPasswordHasher', () => {
  it('genera un hash Argon2id con los parámetros de configuración que verify acepta', async () => {
    const hasher = createPasswordHasher(PARAMETROS);

    const hash = await hasher.hash('SINT-clave');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=8,p=1,t=1\$/);
    expect(await hasher.verify(hash, 'SINT-clave')).toBe(true);
  });

  it('rechaza una contraseña distinta', async () => {
    const hasher = createPasswordHasher(PARAMETROS);
    const hash = await hasher.hash('SINT-clave');

    expect(await hasher.verify(hash, 'otra')).toBe(false);
  });

  it('devuelve false cuando el hash almacenado no es un hash válido', async () => {
    const hasher = createPasswordHasher(PARAMETROS);

    expect(await hasher.verify('hash-sintetico-no-real', 'x')).toBe(false);
  });
});
