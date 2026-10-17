import type { GeneradorDeToken } from '../modules/auth/auth.service.js';

/** Token opaco de sesión: 256 bits de `crypto.randomBytes` en base64url (D1). */
export function crearGeneradorDeToken(): GeneradorDeToken {
  return {
    nuevo: () => {
      throw new Error('no implementado');
    },
  };
}
