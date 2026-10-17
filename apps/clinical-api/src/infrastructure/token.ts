import { randomBytes } from 'node:crypto';
import type { GeneradorDeToken } from '../modules/auth/auth.service.js';

const BYTES_DEL_TOKEN = 32;

/** Token opaco de sesión: 256 bits de `crypto.randomBytes` en base64url (D1). */
export function crearGeneradorDeToken(): GeneradorDeToken {
  return { nuevo: () => randomBytes(BYTES_DEL_TOKEN).toString('base64url') };
}
