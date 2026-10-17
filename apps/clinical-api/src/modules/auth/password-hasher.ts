import type { Argon2Config } from '../../config.js';

/** Puerto de hash de contraseñas: Argon2id en producción, intercambiable en tests de lógica pura. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export function createPasswordHasher(_parametros: Argon2Config): PasswordHasher {
  return {
    hash: () => {
      throw new Error('no implementado');
    },
    verify: () => {
      throw new Error('no implementado');
    },
  };
}
