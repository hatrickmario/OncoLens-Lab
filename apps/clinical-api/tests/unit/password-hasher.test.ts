import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../src/modules/auth/password-hasher.js';

const PARAMETROS = { memoryCostKib: 8, timeCost: 1, parallelism: 1 };

describe('createPasswordHasher', () => {
  it('genera un hash Argon2id con los parámetros de configuración que verify acepta', async () => {
    const hasher = createPasswordHasher(PARAMETROS);

    const hash = await hasher.hash('SINT-clave');

    // El orden de los parámetros en la cadena PHC depende de la versión de la librería: se comparan por nombre.
    const [, variante, version, parametros] = hash.split('$');
    expect(variante).toBe('argon2id');
    expect(version).toBe('v=19');
    expect(Object.fromEntries((parametros ?? '').split(',').map((par) => par.split('=')))).toEqual({
      m: '8',
      t: '1',
      p: '1',
    });
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
