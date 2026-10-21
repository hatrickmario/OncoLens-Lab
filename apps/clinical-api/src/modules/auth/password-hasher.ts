import argon2 from 'argon2';
import type { Argon2Config } from '../../config/index.js';

/** Puerto de hash de contraseñas: Argon2id en producción, intercambiable en tests de lógica pura. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/** Argon2id con los parámetros de configuración (RN-22). Lo comparte el seed para usar los mismos. */
export function createPasswordHasher(parametros: Argon2Config): PasswordHasher {
  return {
    hash: (password) =>
      argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: parametros.memoryCostKib,
        timeCost: parametros.timeCost,
        parallelism: parametros.parallelism,
      }),
    verify: async (passwordHash, password) => {
      try {
        return await argon2.verify(passwordHash, password);
      } catch {
        // Hash almacenado ilegible: se trata como contraseña incorrecta, sin eco del error.
        return false;
      }
    },
  };
}
