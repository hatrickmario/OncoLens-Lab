import type { LeerArchivo } from '../../src/config/secrets.js';

/** Contraseña de una cuenta de demo no resuelta: el mensaje nombra variables, nunca un valor (RN-14). */
export class SecretoDelSeedAusenteError extends Error {
  constructor(
    readonly variable: string,
    motivo: string,
  ) {
    super(`${variable} ${motivo}`);
    this.name = 'SecretoDelSeedAusenteError';
  }
}

/**
 * Resuelve la contraseña `<nombre>`: el archivo de `<nombre>_FILE` es prioritario (L1D-165 D3); la variable directa
 * solo sirve de respaldo local, fuera de Compose. Sin valor por defecto en el código (decisión 66 del plan).
 */
export function leerSecreto(
  _env: NodeJS.ProcessEnv,
  _nombre: string,
  _leerArchivo: LeerArchivo,
): string {
  throw new Error('no implementado');
}
