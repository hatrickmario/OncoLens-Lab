import { ConfiguracionInvalidaError, leerSecretoDeArchivo } from '../../src/config/index.js';
import type { LeerArchivo } from '../../src/config/secrets.js';

/**
 * Resuelve la contraseña `<nombre>`: el archivo de `<nombre>_FILE` es prioritario (L1D-165 D3); la variable directa
 * solo sirve de respaldo local, fuera de Compose. Sin valor por defecto en el código (decisión 66 del plan). Los
 * errores nombran la variable y nunca un valor (RN-14).
 */
export function leerSecreto(
  env: NodeJS.ProcessEnv,
  nombre: string,
  leerArchivo: LeerArchivo,
): string {
  const variableDeArchivo = `${nombre}_FILE`;
  const ruta = env[variableDeArchivo];
  if (ruta !== undefined && ruta !== '') {
    return leerSecretoDeArchivo(variableDeArchivo, ruta, leerArchivo);
  }
  const directo = env[nombre];
  if (directo !== undefined && directo !== '') return directo;
  throw new ConfiguracionInvalidaError(
    variableDeArchivo,
    `no está definida (ni ${nombre} como respaldo local)`,
  );
}
