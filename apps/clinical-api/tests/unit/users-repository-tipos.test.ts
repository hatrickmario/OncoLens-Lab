import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createUsersRepository } from '../../src/modules/users/users.repository.js';

describe('createUsersRepository (tipos)', () => {
  it('rechaza en tipos un Pool, porque BEGIN/COMMIT exigen una sola conexión', () => {
    const pool = {} as pg.Pool;

    // @ts-expect-error un Pool reparte las sentencias entre conexiones y la baja dejaría de ser atómica
    expect(() => createUsersRepository(pool)).not.toThrow();
  });
});
